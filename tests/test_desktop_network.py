import pytest

import desktop


def test_desktop_default_uses_loopback_and_random_port(monkeypatch):
    monkeypatch.delenv("OFFICE_SUPPLIES_LAN", raising=False)
    monkeypatch.delenv("OFFICE_SUPPLIES_HOST", raising=False)
    monkeypatch.delenv("OFFICE_SUPPLIES_PORT", raising=False)
    monkeypatch.setattr(desktop, "_find_free_port", lambda host: 54321)

    host, url_host, port, lan_enabled = desktop._resolve_desktop_network_config()

    assert host == "127.0.0.1"
    assert url_host == "127.0.0.1"
    assert port == 54321
    assert lan_enabled is False


def test_mobile_access_uses_lan_host_and_fixed_port(monkeypatch):
    monkeypatch.setenv("OFFICE_SUPPLIES_LAN", "1")
    monkeypatch.delenv("OFFICE_SUPPLIES_HOST", raising=False)
    monkeypatch.delenv("OFFICE_SUPPLIES_PORT", raising=False)
    monkeypatch.setattr(desktop, "_is_port_available", lambda host, port: True)

    host, url_host, port, lan_enabled = desktop._resolve_desktop_network_config()

    assert host == "0.0.0.0"
    assert url_host == "127.0.0.1"
    assert port == 8000
    assert lan_enabled is True


def test_mobile_access_fails_when_fixed_port_is_busy(monkeypatch):
    monkeypatch.setenv("OFFICE_SUPPLIES_LAN", "1")
    monkeypatch.setenv("OFFICE_SUPPLIES_PORT", "8000")
    monkeypatch.setattr(desktop, "_is_port_available", lambda host, port: False)

    with pytest.raises(RuntimeError, match="Port 8000 is already in use"):
        desktop._resolve_desktop_network_config()
