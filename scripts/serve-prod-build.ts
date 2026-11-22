/**
 * Production Build Server Runner (`scripts/serve-prod-build.ts`)
 *
 * Serves the compiled `@vercel/react-router/vite` (`vercelPreset()`) production build
 * locally for production verification and headless browser smoke testing:
 * - Dynamically resolves `build/server/index.js` or `build/server/nodejs_.../index.js`
 *   using Windows-safe `pathToFileURL` ESM dynamic imports.
 * - Serves static client bundles and PWA assets from `build/client` and `public`
 *   (`/assets/*`, `/sw.js`, `/manifest.json`, `/manifest-driver.json`, icons, etc.)
 *   with accurate `Content-Type`, caching, and security headers.
 * - Forwards all SSR document requests, single-fetch `.data` requests, and `/api/*`
 *   resource routes to `@react-router/node`'s `createRequestListener({ build })`.
 */

import fs from 'node:fs';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { ServerBuild } from 'react-router';

if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = 'production';
}

export interface StartProdBuildServerOptions {
  port?: number;
  host?: string;
  rootDir?: string;
  quiet?: boolean;
}

export interface RunningProdBuildServer {
  server: http.Server;
  host: string;
  port: number;
  baseUrl: string;
  serverEntryPath: string;
  close: () => Promise<void>;
}

const MIME_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.cjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.avif': 'image/avif',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.wasm': 'application/wasm',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
};

/**
 * Loads `.env.local` and `.env` into `process.env` without overriding existing variables.
 */
function hydrateEnvFiles(rootDir: string): void {
  const candidates = ['.env.local', '.env'];
  for (const filename of candidates) {
    const filePath = path.join(rootDir, filename);
    if (!fs.existsSync(filePath)) continue;
    const raw = fs.readFileSync(filePath, 'utf8');
    for (const line of raw.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx <= 0) continue;
      const key = trimmed.slice(0, eqIdx).trim();
      if (!key || process.env[key] !== undefined) continue;
      let value = trimmed.slice(eqIdx + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }
      process.env[key] = value;
    }
  }
}

/**
 * Locates the compiled React Router `ServerBuild` entry (`build/server/index.js`
 * or Vercel preset `build/server/nodejs_<runtime>/index.js`).
 */
export function resolveServerBuildEntryPath(rootDir: string = process.cwd()): string {
  const serverDir = path.resolve(rootDir, 'build', 'server');
  if (!fs.existsSync(serverDir)) {
    throw new Error(
      `Production server build directory not found at "${serverDir}". Run "npm run build" first.`
    );
  }

  const directIndex = path.join(serverDir, 'index.js');
  if (fs.existsSync(directIndex) && fs.statSync(directIndex).isFile()) {
    return directIndex;
  }

  const entries = fs
    .readdirSync(serverDir, { withFileTypes: true })
    .filter((dirent) => dirent.isDirectory() && dirent.name.startsWith('nodejs_'))
    .map((dirent) => dirent.name)
    .sort();

  for (const dirName of entries) {
    const candidate = path.join(serverDir, dirName, 'index.js');
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
      return candidate;
    }
  }

  throw new Error(
    `Could not find compiled ServerBuild entry in "${serverDir}" (checked index.js and nodejs_*/index.js). Run "npm run build" first.`
  );
}

function getContentType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

function resolveSafeStaticFile(baseDir: string, requestPathname: string): string | null {
  if (!fs.existsSync(baseDir)) return null;
  let decodedPath: string;
  try {
    decodedPath = decodeURIComponent(requestPathname);
  } catch {
    return null;
  }

  if (!decodedPath || decodedPath === '/' || decodedPath.includes('\0')) {
    return null;
  }

  const normalizedBase = path.resolve(baseDir);
  const candidate = path.resolve(normalizedBase, '.' + decodedPath);
  if (candidate !== normalizedBase && !candidate.startsWith(normalizedBase + path.sep)) {
    return null;
  }

  try {
    const stat = fs.statSync(candidate);
    if (stat.isFile()) {
      return candidate;
    }
  } catch {
    return null;
  }
  return null;
}

function applyBaselineSecurityHeaders(res: http.ServerResponse): void {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(self), geolocation=(self)');
}

/**
 * Starts an HTTP server serving static client/public assets and the compiled React Router SSR build.
 */
export async function startProdBuildServer(
  options: StartProdBuildServerOptions = {}
): Promise<RunningProdBuildServer> {
  const rootDir = path.resolve(options.rootDir ?? process.cwd());
  hydrateEnvFiles(rootDir);
  if (!process.env.NODE_ENV) {
    process.env.NODE_ENV = 'production';
  }

  const host = options.host ?? process.env.HOST ?? '127.0.0.1';
  const requestedPort =
    options.port !== undefined ? options.port : Number(process.env.PORT ?? 3000);
  const quiet = options.quiet ?? false;

  const serverEntryPath = resolveServerBuildEntryPath(rootDir);
  const { createRequestListener } = await import('@react-router/node');
  const serverModuleUrl = pathToFileURL(serverEntryPath).href;
  const importedModule = (await import(serverModuleUrl)) as Record<string, unknown>;
  const build = (importedModule.default ?? importedModule) as unknown as ServerBuild;

  const clientBuildDir = path.join(rootDir, 'build', 'client');
  const publicDir = path.join(rootDir, 'public');

  const reactRouterListener = createRequestListener({
    build,
    mode: process.env.NODE_ENV || 'production',
  });

  const server = http.createServer((req, res) => {
    applyBaselineSecurityHeaders(res);

    const method = (req.method || 'GET').toUpperCase();
    const rawUrl = req.url || '/';
    let pathname = '/';
    try {
      pathname = new URL(rawUrl, `http://${req.headers.host || 'localhost'}`).pathname;
    } catch {
      pathname = rawUrl.split('?')[0] || '/';
    }

    // Serve static files for GET/HEAD requests (never intercepting /api/* or single-fetch *.data)
    if (
      (method === 'GET' || method === 'HEAD') &&
      !pathname.startsWith('/api/') &&
      !pathname.endsWith('.data')
    ) {
      const effectivePathname =
        pathname === '/favicon.ico' &&
        !resolveSafeStaticFile(clientBuildDir, '/favicon.ico') &&
        !resolveSafeStaticFile(publicDir, '/favicon.ico')
          ? '/icon-192.svg'
          : pathname;

      const staticFile =
        resolveSafeStaticFile(clientBuildDir, effectivePathname) ||
        resolveSafeStaticFile(publicDir, effectivePathname);

      if (staticFile) {
        const stat = fs.statSync(staticFile);
        res.statusCode = 200;
        res.setHeader('Content-Type', getContentType(staticFile));
        res.setHeader('Content-Length', stat.size);

        if (pathname.startsWith('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (pathname === '/sw.js') {
          res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
          res.setHeader('Service-Worker-Allowed', '/');
        } else if (pathname === '/manifest.json' || pathname === '/manifest-driver.json') {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'public, max-age=3600');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }

        if (method === 'HEAD') {
          res.end();
          return;
        }

        const stream = fs.createReadStream(staticFile);
        stream.on('error', (err) => {
          if (!res.headersSent) {
            res.statusCode = 500;
            res.setHeader('Content-Type', 'text/plain; charset=utf-8');
          }
          res.end(err.message);
        });
        stream.pipe(res);
        return;
      }
    }

    void Promise.resolve(reactRouterListener(req, res)).catch((err: unknown) => {
      if (!quiet) {
        console.error('[serve-prod-build] Unhandled SSR/API request error:', err);
      }
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(
          JSON.stringify({
            error: 'Internal Server Error',
            message: err instanceof Error ? err.message : String(err),
          })
        );
      } else {
        res.end();
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(requestedPort, host, () => {
      server.removeListener('error', reject);
      resolve();
    });
  });

  const address = server.address() as AddressInfo;
  const boundPort = address.port;
  const urlHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
  const baseUrl = `http://${urlHost}:${boundPort}`;

  if (!quiet) {
    console.log(
      `[serve-prod-build] Listening on ${baseUrl} (entry: ${path.relative(rootDir, serverEntryPath)})`
    );
  }

  let closed = false;
  const close = async (): Promise<void> => {
    if (closed) return;
    closed = true;
    if (typeof server.closeAllConnections === 'function') {
      server.closeAllConnections();
    }
    await new Promise<void>((resolve, reject) => {
      server.close((err) => {
        if (err) reject(err);
        else resolve();
      });
    });
  };

  return {
    server,
    host: urlHost,
    port: boundPort,
    baseUrl,
    serverEntryPath,
    close,
  };
}

function parseCliPort(argv: string[]): number | undefined {
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if ((arg === '--port' || arg === '-p') && argv[i + 1]) {
      const parsed = Number(argv[i + 1]);
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    } else if (arg.startsWith('--port=')) {
      const parsed = Number(arg.slice('--port='.length));
      if (Number.isFinite(parsed) && parsed >= 0) return parsed;
    }
  }
  return undefined;
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';

if (invokedPath === currentFilePath) {
  const cliPort = parseCliPort(process.argv.slice(2));
  const cliHost = process.env.HOST || '0.0.0.0';
  startProdBuildServer({ port: cliPort, host: cliHost })
    .then((running) => {
      const shutdown = () => {
        console.log('\n[serve-prod-build] Shutting down...');
        running
          .close()
          .then(() => process.exit(0))
          .catch(() => process.exit(1));
      };
      process.once('SIGINT', shutdown);
      process.once('SIGTERM', shutdown);
    })
    .catch((err) => {
      console.error('[serve-prod-build] Failed to start production server:', err);
      process.exit(1);
    });
}
