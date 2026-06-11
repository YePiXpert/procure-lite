const CACHE_VERSION = '1.2.76';
const CACHE_PREFIXES = [
    'procure-lite-shell-',
];

async function clearProcureLiteCaches() {
    const keys = await caches.keys();
    await Promise.all(
        keys
            .filter((key) => CACHE_PREFIXES.some((prefix) => key.startsWith(prefix)))
            .map((key) => caches.delete(key))
    );
}

self.addEventListener('install', (event) => {
    event.waitUntil(
        clearProcureLiteCaches()
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (event) => {
    event.waitUntil(
        clearProcureLiteCaches()
            .then(() => self.clients.claim())
    );
});

self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

// Intentionally no fetch handler: every page, static asset, and API request goes
// to the network and follows the server's no-store cache policy.
