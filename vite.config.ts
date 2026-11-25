import { reactRouter } from "@react-router/dev/vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig(({ command, mode, isSsrBuild }) => {
  // Hydrate server-only .env / .env.local variables (RESEND_API_KEY, EMAIL_FROM, TWILIO_*, STRIPE_*, etc.)
  // into Node process.env for SSR & /api/* routes during `npm run dev`.
  const loadedEnv = loadEnv(mode, process.cwd(), "");
  for (const [key, val] of Object.entries(loadedEnv)) {
    if (process.env[key] === undefined && val !== undefined) {
      process.env[key] = val;
    }
  }

  // IMPORTANT: Only strip `process.env` during the production CLIENT bundle build (`command === 'build' && !isSsrBuild`).
  // During `npm run dev` (`command === 'serve'`), `isSsrBuild` is false for the whole dev server, so setting
  // `'process.env': {}` in serve mode wiped out `process.env.RESEND_API_KEY` inside SSR `/api/*` routes!
  const isClientProdBuild = command === 'build' && !isSsrBuild;

  return {
    server: {
      host: true,
      allowedHosts: ['.trycloudflare.com'],
    },
    define: isClientProdBuild
      ? {
          'process.env.VITE_CLIENT_BUILD': JSON.stringify('1'),
          'process.env': {},
        }
      : {},
    plugins: [tailwindcss(), reactRouter(), tsconfigPaths()],
    build: {
      chunkSizeWarningLimit: 1000,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (id.includes('node_modules/firebase') || id.includes('node_modules/@firebase')) {
              return 'firebase';
            }
            if (
              id.includes('node_modules/react') ||
              id.includes('node_modules/react-dom') ||
              id.includes('node_modules/@react-router') ||
              id.includes('node_modules/react-router')
            ) {
              return 'react-router';
            }
            if (id.includes('node_modules/@monaco-editor') || id.includes('node_modules/monaco-editor')) {
              return 'vendor-monaco';
            }
            if (id.includes('node_modules/@hello-pangea/dnd')) {
              return 'vendor-dnd';
            }
            if (id.includes('node_modules/@googlemaps')) {
              return 'vendor-maps';
            }
            if (id.includes('/components/ui/') || id.includes('\\components\\ui\\')) {
              return 'core-ui';
            }
          },
        },
      },
    },
  };
});
