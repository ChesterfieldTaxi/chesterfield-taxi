/**
 * Chesterfield Taxi — Root Service Worker (Phase 34 PWA Hardening)
 *
 * Scope: `/`
 * Capabilities:
 * 1. Network-first navigation fetching with cached shell & resilient offline HTML fallback.
 * 2. Stale-while-revalidate caching strictly for static `/icon-*.svg` and `/manifest*.json` assets
 *    (never caches `/api/*`, React Router `.data` requests, or cross-origin Firestore/Auth/Maps traffic).
 * 3. Web Push (`push`) and local client-dispatched (`SHOW_LOCAL_NOTIFICATION`) background notifications.
 * 4. `notificationclick` handler that focuses an existing `/app/driver` or `/app/dispatch` window client
 *    and posts `NOTIFICATION_CLICK` (or opens `targetUrl` if none is open).
 */

const STATIC_CACHE = 'ct-pwa-static-v1';
const NAV_CACHE = 'ct-pwa-nav-v1';
const KNOWN_CACHES = new Set([STATIC_CACHE, NAV_CACHE]);

const PRECACHE_STATIC_ASSETS = [
  '/manifest.json',
  '/manifest-driver.json',
  '/icon-192.svg',
  '/icon-512.svg',
  '/icon-driver-192.svg',
  '/icon-driver-512.svg',
];

const STATIC_ASSET_PATTERN = /^\/(icon-[^/]+\.svg|manifest[^/]*\.json)$/i;

const OFFLINE_FALLBACK_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <meta name="theme-color" content="#020617" />
  <title>Chesterfield Taxi — Reconnecting</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 24px;
      box-sizing: border-box;
      background: #020617;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      text-align: center;
    }
    .card {
      max-width: 400px;
      width: 100%;
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 20px;
      padding: 28px 24px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.45);
    }
    h1 { font-size: 1.25rem; margin: 0 0 8px; }
    p { font-size: 0.875rem; color: #94a3b8; line-height: 1.5; margin: 0 0 20px; }
    .actions { display: flex; flex-direction: column; gap: 10px; }
    a, button {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-height: 44px;
      padding: 10px 16px;
      border-radius: 12px;
      font-weight: 700;
      font-size: 0.85rem;
      text-decoration: none;
      cursor: pointer;
      border: none;
    }
    .primary { background: #2563eb; color: #ffffff; }
    .secondary { background: #1e293b; color: #e2e8f0; border: 1px solid #334155; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Network Temporarily Unavailable</h1>
    <p>Chesterfield Taxi could not reach the live dispatch network. Check your cellular or Wi-Fi connection and retry.</p>
    <div class="actions">
      <button type="button" class="primary" onclick="window.location.reload()">Retry Connection</button>
      <a class="secondary" href="tel:+13147380100">Call 24/7 Dispatch: (314) 738-0100</a>
    </div>
  </div>
</body>
</html>`;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => cache.addAll(PRECACHE_STATIC_ASSETS))
      .catch(() => {
        // Non-fatal precache miss in dev/test environments
      })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    Promise.all([
      caches
        .keys()
        .then((keys) =>
          Promise.all(
            keys.map((key) => {
              if (key.startsWith('ct-pwa-') && !KNOWN_CACHES.has(key)) {
                return caches.delete(key);
              }
              return Promise.resolve(false);
            })
          )
        )
        .catch(() => {}),
      self.clients.claim(),
    ])
  );
});

function isBypassedRequest(request, url) {
  if (request.method !== 'GET') return true;
  if (url.origin !== self.location.origin) return true;
  if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return true;
  if (url.pathname.endsWith('.data') || url.pathname.startsWith('/__manifest')) return true;
  return false;
}

function isNavigationRequest(request) {
  if (request.mode === 'navigate') return true;
  const accept = (request.headers && request.headers.get && request.headers.get('accept')) || '';
  return accept.includes('text/html');
}

async function handleStaticStaleWhileRevalidate(request) {
  const cache = await caches.open(STATIC_CACHE);
  const cachedResponse = await cache.match(request);

  const networkPromise = fetch(request)
    .then((networkResponse) => {
      if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
        cache.put(request, networkResponse.clone()).catch(() => {});
      }
      return networkResponse;
    })
    .catch(() => null);

  if (cachedResponse) {
    return cachedResponse;
  }

  const fresh = await networkPromise;
  if (fresh) {
    return fresh;
  }

  return new Response('', { status: 504, statusText: 'Gateway Timeout' });
}

async function handleNavigationNetworkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse && networkResponse.ok && networkResponse.status === 200) {
      const cache = await caches.open(NAV_CACHE);
      cache.put(request, networkResponse.clone()).catch(() => {});
    }
    return networkResponse;
  } catch {
    try {
      const cache = await caches.open(NAV_CACHE);
      const exactMatch = await cache.match(request);
      if (exactMatch) return exactMatch;
    } catch {}

    return new Response(OFFLINE_FALLBACK_HTML, {
      status: 503,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    });
  }
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (!request || !request.url) return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }

  if (isBypassedRequest(request, url)) {
    return;
  }

  if (STATIC_ASSET_PATTERN.test(url.pathname)) {
    event.respondWith(handleStaticStaleWhileRevalidate(request));
    return;
  }

  if (isNavigationRequest(request)) {
    event.respondWith(handleNavigationNetworkFirst(request));
  }
});

function normalizeNotificationPayload(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const nestedNotif =
    source.notification && typeof source.notification === 'object' ? source.notification : {};
  const nestedData = source.data && typeof source.data === 'object' ? source.data : {};
  const fcmOptions =
    source.fcmOptions && typeof source.fcmOptions === 'object' ? source.fcmOptions : {};

  const title = String(
    source.title || nestedNotif.title || nestedData.title || 'Chesterfield Taxi'
  );
  const body = String(
    source.body || nestedNotif.body || nestedData.body || 'New dispatch notification available.'
  );
  const url = String(
    source.url || nestedData.url || fcmOptions.link || '/app/driver'
  );
  const isDriverTarget = url.startsWith('/app/driver') || url.startsWith('/driver');
  const defaultIcon = isDriverTarget ? '/icon-driver-192.svg' : '/icon-192.svg';

  const tag = String(source.tag || nestedNotif.tag || nestedData.tag || 'ct-operational-alert');
  const requireInteraction = Boolean(
    source.requireInteraction !== undefined
      ? source.requireInteraction
      : nestedNotif.requireInteraction !== undefined
      ? nestedNotif.requireInteraction
      : isDriverTarget
  );
  const vibrate = Array.isArray(source.vibrate)
    ? source.vibrate
    : [200, 100, 200];

  return {
    title,
    options: {
      body,
      tag,
      icon: String(source.icon || nestedNotif.icon || defaultIcon),
      badge: String(source.badge || nestedNotif.badge || defaultIcon),
      requireInteraction,
      renotify: true,
      vibrate,
      data: {
        ...nestedData,
        url,
        tag,
        dispatchedAt: Date.now(),
      },
    },
  };
}

self.addEventListener('push', (event) => {
  let rawPayload = {};
  if (event.data) {
    try {
      rawPayload = event.data.json();
    } catch {
      try {
        const text = event.data.text();
        rawPayload = text ? { body: text } : {};
      } catch {
        rawPayload = {};
      }
    }
  }

  const { title, options } = normalizeNotificationPayload(rawPayload);
  if (self.registration && typeof self.registration.showNotification === 'function') {
    event.waitUntil(self.registration.showNotification(title, options));
  }
});

self.addEventListener('message', (event) => {
  const message = event.data;
  if (!message || typeof message !== 'object') return;

  if (message.type === 'SKIP_WAITING') {
    self.skipWaiting();
    return;
  }

  if (message.type === 'SHOW_LOCAL_NOTIFICATION') {
    const { title, options } = normalizeNotificationPayload(message.payload || {});
    if (self.registration && typeof self.registration.showNotification === 'function') {
      const promise = self.registration.showNotification(title, options);
      if (typeof event.waitUntil === 'function') {
        event.waitUntil(promise);
      }
    }
  }
});

self.addEventListener('notificationclick', (event) => {
  if (event.notification && typeof event.notification.close === 'function') {
    event.notification.close();
  }

  const notifData = (event.notification && event.notification.data) || {};
  const targetUrl = String(notifData.url || '/app/driver');
  const tag = (event.notification && event.notification.tag) || notifData.tag || '';

  const preferDispatch = targetUrl.startsWith('/app/dispatch') || targetUrl.startsWith('/dispatch');
  const preferredPrefix = preferDispatch ? '/app/dispatch' : '/app/driver';

  const handleClick = async () => {
    const windowClients = await self.clients.matchAll({
      type: 'window',
      includeUncontrolled: true,
    });

    let exactWorkspaceClient = null;
    let fallbackOperationalClient = null;

    for (const client of windowClients) {
      let pathname = '';
      try {
        pathname = new URL(client.url, self.location.origin).pathname;
      } catch {
        pathname = String(client.url || '');
      }

      const isDriverWindow = pathname.startsWith('/app/driver') || pathname.startsWith('/driver');
      const isDispatchWindow =
        pathname.startsWith('/app/dispatch') || pathname.startsWith('/dispatch');

      if (!exactWorkspaceClient && pathname.startsWith(preferredPrefix)) {
        exactWorkspaceClient = client;
      }
      if (!fallbackOperationalClient && (isDriverWindow || isDispatchWindow)) {
        fallbackOperationalClient = client;
      }
    }

    const targetClient = exactWorkspaceClient || fallbackOperationalClient;
    if (targetClient) {
      try {
        if (typeof targetClient.focus === 'function') {
          await targetClient.focus();
        }
      } catch {}

      try {
        if (typeof targetClient.postMessage === 'function') {
          targetClient.postMessage({
            type: 'NOTIFICATION_CLICK',
            payload: {
              url: targetUrl,
              tag,
              data: notifData,
            },
          });
        }
      } catch {}

      return targetClient;
    }

    if (self.clients && typeof self.clients.openWindow === 'function') {
      return self.clients.openWindow(targetUrl);
    }
    return null;
  };

  event.waitUntil(handleClick());
});
