(function (global) {
    const OFFLINE_MESSAGE = '仅可查看已缓存页面，台账、OCR、备份等操作需联网';
    const INSTALL_DISMISS_KEY = 'procure-lite:pwa-install-dismissed';

    function isStandalone() {
        return global.matchMedia('(display-mode: standalone)').matches ||
            global.navigator.standalone === true;
    }

    function ensurePwaStyles() {
        if (document.getElementById('pwa-runtime-styles')) return;
        const style = document.createElement('style');
        style.id = 'pwa-runtime-styles';
        style.textContent = `
            .pwa-runtime-panel {
                position: fixed;
                left: 50%;
                bottom: max(16px, env(safe-area-inset-bottom));
                z-index: 10000;
                display: flex;
                align-items: center;
                gap: 10px;
                max-width: min(92vw, 560px);
                padding: 10px 12px;
                border: 1px solid rgba(15, 23, 42, 0.12);
                border-radius: 8px;
                background: rgba(15, 23, 42, 0.96);
                color: #fff;
                box-shadow: 0 18px 40px rgba(15, 23, 42, 0.22);
                font-size: 13px;
                line-height: 1.45;
                transform: translateX(-50%);
            }
            .pwa-runtime-panel[hidden] {
                display: none;
            }
            .pwa-runtime-panel button {
                height: 30px;
                border: 0;
                border-radius: 6px;
                padding: 0 10px;
                background: #2563eb;
                color: #fff;
                font-size: 12px;
                font-weight: 600;
                white-space: nowrap;
                cursor: pointer;
            }
            .pwa-runtime-panel button[data-variant="ghost"] {
                background: rgba(255, 255, 255, 0.12);
            }
            @media (max-width: 640px) {
                .pwa-runtime-panel {
                    width: calc(100vw - 24px);
                    align-items: flex-start;
                    flex-direction: column;
                }
            }
        `;
        document.head.appendChild(style);
    }

    function createPanel(id) {
        ensurePwaStyles();
        let panel = document.getElementById(id);
        if (!panel) {
            panel = document.createElement('div');
            panel.id = id;
            panel.className = 'pwa-runtime-panel';
            panel.hidden = true;
            document.body.appendChild(panel);
        }
        return panel;
    }

    function showOfflineNotice() {
        const panel = createPanel('pwa-offline-panel');
        panel.textContent = OFFLINE_MESSAGE;
        panel.hidden = false;
    }

    function hideOfflineNotice() {
        const panel = document.getElementById('pwa-offline-panel');
        if (panel) panel.hidden = true;
    }

    function updateOnlineState() {
        if (navigator.onLine) {
            hideOfflineNotice();
        } else {
            showOfflineNotice();
        }
    }

    function requestSkipWaiting(registration) {
        if (registration && registration.waiting && navigator.serviceWorker.controller) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
    }

    function registerServiceWorker() {
        if (!('serviceWorker' in navigator)) return;
        const hadController = Boolean(navigator.serviceWorker.controller);
        let refreshing = false;

        navigator.serviceWorker.addEventListener('controllerchange', () => {
            if (!hadController || refreshing) return;
            refreshing = true;
            global.location.reload();
        });

        global.addEventListener('load', () => {
            navigator.serviceWorker.register('/sw.js', { scope: '/' })
                .then((registration) => {
                    requestSkipWaiting(registration);
                    registration.addEventListener('updatefound', () => {
                        const worker = registration.installing;
                        if (!worker) return;
                        worker.addEventListener('statechange', () => {
                            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
                                worker.postMessage({ type: 'SKIP_WAITING' });
                            }
                        });
                    });
                })
                .catch(() => {});
        });
    }

    function isIosSafari() {
        const ua = navigator.userAgent || '';
        const isIos = /iPad|iPhone|iPod/.test(ua) ||
            (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        return isIos && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    }

    function showInstallPanel(message, installHandler) {
        if (isStandalone() || localStorage.getItem(INSTALL_DISMISS_KEY) === '1') return;
        const panel = createPanel('pwa-install-panel');
        panel.innerHTML = '';
        const copy = document.createElement('span');
        copy.textContent = message;
        panel.appendChild(copy);

        if (installHandler) {
            const installButton = document.createElement('button');
            installButton.type = 'button';
            installButton.textContent = '安装到桌面';
            installButton.addEventListener('click', installHandler);
            panel.appendChild(installButton);
        }

        const closeButton = document.createElement('button');
        closeButton.type = 'button';
        closeButton.dataset.variant = 'ghost';
        closeButton.textContent = '关闭';
        closeButton.addEventListener('click', () => {
            localStorage.setItem(INSTALL_DISMISS_KEY, '1');
            panel.hidden = true;
        });
        panel.appendChild(closeButton);
        panel.hidden = false;
    }

    function setupInstallExperience() {
        let deferredPrompt = null;
        global.addEventListener('beforeinstallprompt', (event) => {
            event.preventDefault();
            deferredPrompt = event;
            showInstallPanel('可将 Procure Lite 安装到桌面，以独立窗口打开。', async () => {
                if (!deferredPrompt) return;
                deferredPrompt.prompt();
                try {
                    await deferredPrompt.userChoice;
                } finally {
                    deferredPrompt = null;
                    const panel = document.getElementById('pwa-install-panel');
                    if (panel) panel.hidden = true;
                }
            });
        });

        global.addEventListener('appinstalled', () => {
            localStorage.setItem(INSTALL_DISMISS_KEY, '1');
            const panel = document.getElementById('pwa-install-panel');
            if (panel) panel.hidden = true;
        });

        global.addEventListener('load', () => {
            if (isIosSafari() && !isStandalone()) {
                showInstallPanel('在 Safari 中可通过“分享” → “添加到主屏幕”安装 Procure Lite。');
            }
        });
    }

    function setupApiOfflineNotice() {
        if (!global.axios || !global.axios.interceptors) return;
        global.axios.interceptors.request.use((config) => {
            const url = new URL(config.url || '', global.location.href);
            if (!navigator.onLine && url.origin === global.location.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
                showOfflineNotice();
            }
            return config;
        });
        global.axios.interceptors.response.use(
            (response) => response,
            (error) => {
                const requestUrl = error && error.config ? error.config.url : '';
                const url = new URL(requestUrl || '', global.location.href);
                if (!navigator.onLine && url.origin === global.location.origin && (url.pathname === '/api' || url.pathname.startsWith('/api/'))) {
                    showOfflineNotice();
                }
                return Promise.reject(error);
            }
        );
    }

    function setupMobileInteractionGuards() {
        const hasTouch = ('ontouchstart' in global) || Number(navigator.maxTouchPoints || 0) > 0;
        if (!hasTouch) return;

        const preventGestureZoom = (event) => {
            event.preventDefault();
        };
        const preventMultiTouchMove = (event) => {
            if (event.touches && event.touches.length > 1) {
                event.preventDefault();
            }
        };

        ['gesturestart', 'gesturechange', 'gestureend'].forEach((eventName) => {
            global.addEventListener(eventName, preventGestureZoom, { passive: false });
        });

        document.addEventListener('touchmove', preventMultiTouchMove, { passive: false });
    }

    global.addEventListener('online', updateOnlineState);
    global.addEventListener('offline', updateOnlineState);
    global.addEventListener('load', updateOnlineState);

    registerServiceWorker();
    setupInstallExperience();
    setupApiOfflineNotice();
    setupMobileInteractionGuards();
})(window);
