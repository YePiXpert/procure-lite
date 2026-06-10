from fastapi.testclient import TestClient


def _client(monkeypatch):
    monkeypatch.setenv("AUTO_MIGRATE", "0")
    from main import app

    return TestClient(app)


def test_root_exposes_pwa_metadata(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/")

    assert response.status_code == 200
    assert "no-cache" in response.headers.get("cache-control", "")
    html = response.text
    assert 'rel="manifest"' in html
    assert 'href="/manifest.webmanifest"' in html
    assert 'name="theme-color" content="#2563eb"' in html
    assert 'rel="apple-touch-icon"' in html
    assert '/static/pwa.js?v=1.2.73' in html


def test_manifest_contract(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/manifest.webmanifest")

    assert response.status_code == 200
    assert "application/manifest+json" in response.headers.get("content-type", "")
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
    assert "192x192" in icon_sizes
    assert "512x512" in icon_sizes
    assert any("maskable" in icon.get("purpose", "") for icon in manifest["icons"])


def test_service_worker_contract(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/sw.js")

    assert response.status_code == 200
    assert "application/javascript" in response.headers.get("content-type", "")
    assert response.headers.get("service-worker-allowed") == "/"
    assert "no-cache" in response.headers.get("cache-control", "")
    body = response.text
    assert "CACHE_VERSION = '1.2.73'" in body
    assert "url.pathname.startsWith('/api/')" in body
    assert "network-only" in body
    assert "SKIP_WAITING" in body
    assert "/static/pwa.js?v=1.2.73" in body


def test_pwa_icons_are_root_served_pngs(monkeypatch):
    icon_paths = [
        "/icons/icon-180.png",
        "/icons/icon-192.png",
        "/icons/icon-512.png",
        "/icons/maskable-192.png",
        "/icons/maskable-512.png",
    ]
    with _client(monkeypatch) as client:
        for path in icon_paths:
            response = client.get(path)
            assert response.status_code == 200
            assert "image/png" in response.headers.get("content-type", "")
            assert response.content.startswith(b"\x89PNG\r\n\x1a\n")


def test_app_metadata_remains_network_api(monkeypatch):
    with _client(monkeypatch) as client:
        response = client.get("/api/app/metadata")

    assert response.status_code == 200
    assert response.json()["version"] == "1.2.73"
