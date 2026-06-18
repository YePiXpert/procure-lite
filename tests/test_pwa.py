from fastapi.testclient import TestClient

from app_metadata import APP_VERSION


def _png_size(content: bytes) -> tuple[int, int]:
    assert content.startswith(b"\x89PNG\r\n\x1a\n")
    return (
        int.from_bytes(content[16:20], "big"),
        int.from_bytes(content[20:24], "big"),
    )


def _client(monkeypatch):
    monkeypatch.setenv("AUTO_MIGRATE", "0")
    from main import app

    return TestClient(app)


def test_root_exposes_pwa_metadata(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert "no-store" in response.headers.get("cache-control", "")
    html = response.text
    assert 'name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=no, viewport-fit=cover"' in html
    assert 'rel="manifest"' in html
    assert 'href="/manifest.webmanifest"' in html
    assert 'name="theme-color" content="#2563eb"' in html
    assert 'rel="icon" href="/favicon.ico"' in html
    assert 'rel="icon" type="image/svg+xml" href="/icons/icon.svg"' in html
    assert 'rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png"' in html
    assert 'rel="apple-touch-icon"' in html
    assert f'/static/pwa.js?v={APP_VERSION}' in html


def test_manifest_contract(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/manifest.webmanifest")

    assert response.status_code == 200
    assert "application/manifest+json" in response.headers.get("content-type", "")
    assert "no-store" in response.headers.get("cache-control", "")
    manifest = response.json()
    assert manifest["name"] == "Procure Lite"
    assert manifest["short_name"] == "Procure Lite"
    assert manifest["start_url"] == "/"
    assert manifest["scope"] == "/"
    assert manifest["display"] == "standalone"
    assert manifest["theme_color"] == "#2563eb"
    assert manifest["background_color"] == "#f8fafc"
    assert manifest["lang"] == "zh-CN"
    icon_sizes = {icon["sizes"]: icon for icon in manifest["icons"]}
    assert "48x48" in icon_sizes
    assert "192x192" in icon_sizes
    assert "512x512" in icon_sizes
    assert icon_sizes["512x512"]["purpose"] == "any maskable"
    assert any("maskable" in icon.get("purpose", "") for icon in manifest["icons"])


def test_service_worker_contract(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/sw.js")

    assert response.status_code == 200
    assert "application/javascript" in response.headers.get("content-type", "")
    assert response.headers.get("service-worker-allowed") == "/"
    assert "no-store" in response.headers.get("cache-control", "")
    body = response.text
    assert f"CACHE_VERSION = '{APP_VERSION}'" in body
    assert "clearProcureLiteCaches" in body
    assert "addEventListener('fetch'" not in body
    assert "respondWith" not in body
    assert "caches.open" not in body
    assert "cache.addAll" not in body
    assert "cache.match" not in body
    assert "SKIP_WAITING" in body


def test_static_assets_are_not_cached(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get(f"/static/app.css?v={APP_VERSION}")

    assert response.status_code == 200
    assert "text/css" in response.headers.get("content-type", "")
    assert "no-store" in response.headers.get("cache-control", "")


def test_mobile_pwa_shell_contract(monkeypatch):
    with _client(monkeypatch) as client:
        html_response = client.get("/")
        css_response = client.get(f"/static/app.css?v={APP_VERSION}")
        state_response = client.get(f"/static/state.js?v={APP_VERSION}")
        api_response = client.get(f"/static/api.js?v={APP_VERSION}")
        pwa_response = client.get(f"/static/pwa.js?v={APP_VERSION}")

    html = html_response.text
    css = css_response.text
    state_js = state_response.text
    api_js = api_response.text
    pwa_js = pwa_response.text
    assert 'class="mobile-tabbar"' in html
    assert 'v-for="view in mobileTabViews"' in html
    assert 'class="mobile-selection-dock"' in html
    assert 'class="mobile-action-sheet-overlay"' in html
    assert 'class="mobile-action-sheet-details"' in html
    assert 'class="ledger-mobile-quick-meta"' in html
    assert 'class="ledger-mobile-summary-grid"' not in html
    assert "openMobileLedgerActionSheet(item)" in html
    assert "mobileTabViews()" in state_js
    assert "dashboard', 'ledger', 'execution', 'operations', 'reports" in state_js
    assert "Mobile PWA v2" in css
    assert "--mobile-touch-target: 2.75rem" in css
    assert ".mobile-tabbar" in css
    assert ".mobile-selection-dock" in css
    assert ".mobile-action-sheet-overlay" in css
    assert ".mobile-action-sheet-details" in css
    assert ".ledger-mobile-quick-meta" in css
    assert "position: fixed" in css
    assert "touch-action: pan-x pan-y" in css
    assert "content-visibility: auto" in css
    assert "max-height: min(58dvh, 30rem)" in css
    assert "grid-template-columns: repeat(5, minmax(0, 1fr))" in css
    assert "execution-card:nth-of-type(n+4)" not in css
    assert ".ledger-filter-card" in css
    assert ".execution-filter-bar" in css
    assert "openMobileLedgerActionSheet(item)" in api_js
    assert "closeMobileTransientSurfaces()" in api_js
    assert "scrollMobileViewportToTop()" in api_js
    assert "setupMobileInteractionGuards()" in pwa_js
    assert "'gesturestart', 'gesturechange', 'gestureend'" in pwa_js
    assert "document.addEventListener('touchmove', preventMultiTouchMove, { passive: false })" in pwa_js


def test_pwa_icons_are_root_served_pngs(monkeypatch):
    icon_paths = {
        "/icons/favicon-16.png": (16, 16),
        "/icons/favicon-32.png": (32, 32),
        "/icons/icon-48.png": (48, 48),
        "/icons/icon-180.png": (180, 180),
        "/icons/icon-192.png": (192, 192),
        "/icons/icon-512.png": (512, 512),
        "/icons/maskable-192.png": (192, 192),
        "/icons/maskable-512.png": (512, 512),
    }
    with _client(monkeypatch) as client:
        for path, size in icon_paths.items():
            response = client.get(path)
            assert response.status_code == 200
            assert "image/png" in response.headers.get("content-type", "")
            assert "no-store" in response.headers.get("cache-control", "")
            assert _png_size(response.content) == size


def test_favicon_assets_are_root_served(monkeypatch):
    with _client(monkeypatch) as client:
        ico_response = client.get("/favicon.ico")
        svg_response = client.get("/icons/icon.svg")

    assert ico_response.status_code == 200
    assert "image/" in ico_response.headers.get("content-type", "")
    assert "no-store" in ico_response.headers.get("cache-control", "")
    assert ico_response.content.startswith(b"\x00\x00\x01\x00")

    assert svg_response.status_code == 200
    assert "image/svg+xml" in svg_response.headers.get("content-type", "")
    assert "no-store" in svg_response.headers.get("cache-control", "")
    assert b"<svg" in svg_response.content


def test_app_metadata_remains_network_api(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/api/app/metadata")

    assert response.status_code == 200
    assert "no-store" in response.headers.get("cache-control", "")
    assert response.json()["version"] == APP_VERSION
