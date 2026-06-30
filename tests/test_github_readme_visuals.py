from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
GITHUB_ASSETS = ROOT / "docs" / "assets" / "github"


def read_text(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def png_size(path: Path) -> tuple[int, int]:
    content = path.read_bytes()
    assert content.startswith(b"\x89PNG\r\n\x1a\n")
    return (
        int.from_bytes(content[16:20], "big"),
        int.from_bytes(content[20:24], "big"),
    )


def test_readme_lists_github_visual_gallery():
    readme = read_text("README.md")

    assert "### 示例界面" in readme
    assert "### 流程与架构" in readme
    assert "./docs/assets/github/sample-workbench.png" in readme
    assert "./docs/assets/github/sample-mobile-pwa.png" in readme
    assert "./docs/assets/github/data-lifecycle.svg" in readme
    assert "./docs/assets/github/self-hosted-topology.svg" in readme
    assert "桌面采购工作台" in readme
    assert "移动端 PWA" in readme


def test_github_sample_pngs_are_project_assets():
    expected_assets = [
        GITHUB_ASSETS / "sample-workbench.png",
        GITHUB_ASSETS / "sample-mobile-pwa.png",
    ]

    for image_path in expected_assets:
        assert image_path.exists()
        assert image_path.stat().st_size > 900_000
        width, height = png_size(image_path)
        assert width >= 1400
        assert height >= 800


def test_github_flow_diagrams_are_readable_svgs():
    expected_diagrams = {
        "data-lifecycle.svg": ["端到端数据生命周期", "上传单据", "OCR", "备份恢复"],
        "self-hosted-topology.svg": ["自托管部署拓扑", "VPS Docker Compose", "SQLite", "WebDAV"],
    }

    for filename, expected_labels in expected_diagrams.items():
        svg = (GITHUB_ASSETS / filename).read_text(encoding="utf-8")
        assert svg.startswith("<svg")
        assert 'role="img"' in svg
        assert "viewBox=" in svg
        assert len(svg) > 4_000
        for label in expected_labels:
            assert label in svg
