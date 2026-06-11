const CACHE_VERSION = '1.2.76';
const SHELL_CACHE = `procure-lite-shell-v${CACHE_VERSION}`;
const APP_SHELL_URL = '/';
const PRECACHE_URLS = [
    '/',
    '/manifest.webmanifest',
    '/icons/icon-180.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/maskable-192.png',
    '/icons/maskable-512.png',
    '/static/vendor/tailwindcss-cdn.js',
    '/static/vendor/vue.global.prod.js',
    '/static/vendor/axios.min.js',
    '/static/app.css?v=1.2.76',
    '/static/view-config.js?v=1.2.76',
    '/static/time-utils.js?v=1.2.76',
    '/static/ledger-ui-helpers.js?v=1.2.76',
    '/static/state.js?v=1.2.76',
    '/static/operations-center-api.js?v=1.2.76',
    '/static/api.js?v=1.2.76',
    '/static/ledger-filter-panel.js?v=1.2.76',
    '/static/ledger-batch-toolbar.js?v=1.2.76',
    '/static/ledger-table-panel.js?v=1.2.76',
    '/static/ledger-detail-modal.js?v=1.2.76',
    '/static/ledger-add-modal.js?v=1.2.76',
    '/static/ops-panel-mixin.js?v=1.2.76',
    '/static/ops-overview-panel.js?v=1.2.76',
    '/static/ops-procurement-panel.js?v=1.2.76',
    '/static/ops-master-data-panel.js?v=1.2.76',
    '/static/ops-exceptions-panel.js?v=1.2.76',
    '/static/settings-operations-panel.js?v=1.2.76',
    '/static/settings-ai-panel.js?v=1.2.76',
    '/static/settings-maintenance-panel.js?v=1.2.76',
    '/static/webdav-modal.js?v=1.2.76',
    '/static/audit-log-panel.js?v=1.2.76',
    '/static/recycle-bin-modal.js?v=1.2.76',
    '/static/data-quality-modal.js?v=1.2.76',
    '/static/import-preview-modal.js?v=1.2.76',
    '/static/duplicate-modal.js?v=1.2.76',
    '/static/pwa.js?v=1.2.76',
    '/static/ui.js?v=1.2.76',
];

function isSameOrigin(url) {
    return url.origin === self.location.origin;
}

function isNetworkOnlyRequest(request, url) {
    // Business data, auth, OCR, uploads, downloads, backup, restore, WebDAV,
    // ZIP/database-related responses, and every other API response are always network-only.
    return (
        request.method !== 'GET' ||
        !isSameOrigin(url) ||
        url.pathname === '/api' ||
        url.pathname.startsWith('/api/') ||
        url.pathname === '/sw.js' ||
        url.pathname.endsWith('.zip')
    );
}

function isShellNavigation(request) {
    return request.mode === 'navigate' || request.destination === 'document';
}

function isCacheableShellAsset(url) {
    return (
        url.pathname === '/' ||
        url.pathname === '/manifest.webmanifest' ||
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/static/')
    );
}

async function putIfCacheable(request, response) {
    if (!response || !response.ok || response.type === 'opaque') {
        return response;
    }
    const cache = await caches.open(SHELL_CACHE);
    await cache.put(request, response.clone());
    return response;
}

async function networkFirstShell(request) {
    try {
        const response = await fetch(request);
        return await putIfCacheable(request, response);
    } catch (_) {
        const cache = await caches.open(SHELL_CACHE);
        return (await cache.match(request)) || cache.match(APP_SHELL_URL);
    }
}

async function cacheFirstAsset(request) {
    const cache = await caches.open(SHELL_CACHE);
    const cached = await cache.match(request);
    if (cached) {
        return cached;
    }
    const response = await fetch(request);
    return putIfCacheable(request, response);
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(SHELL_CACHE)
            .then((cache) => cache.addAll(PRECACHE_URLS))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys()
            .then((keys) => Promise.all(
                keys
                    .filter((key) => key.startsWith('procure-lite-shell-') && key !== SHELL_CACHE)
                    .map((key) => caches.delete(key))
            ))
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);
    if (isNetworkOnlyRequest(request, url)) {
        return;
    }
    if (isShellNavigation(request)) {
        event.respondWith(networkFirstShell(request));
        return;
    }
    if (isCacheableShellAsset(url)) {
        event.respondWith(cacheFirstAsset(request));
    }
});
