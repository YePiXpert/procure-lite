#!/usr/bin/env python3
"""Exercise deployment paths with fake Git/Docker; never contact live services."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

REPO = Path(__file__).resolve().parents[2]
STUB = r'''#!/usr/bin/env python3
import json, os, pathlib, sys
tool = pathlib.Path(sys.argv[0]).name
args = sys.argv[1:]
with open(os.environ["COMMAND_LOG"], "a") as out:
    out.write(json.dumps([tool, str(pathlib.Path.cwd()), args]) + "\n")
if tool == "git":
    if args[0] == "clone":
        p = pathlib.Path(args[-1])
        p.mkdir(parents=True)
        (p / ".git").mkdir()
        (p / "docker-compose.yml").write_text("services: {}\n")
    elif args[0] == "diff" and os.environ.get("DIRTY_TRACKED") == "1":
        sys.exit(1)
    elif args[0] == "rev-parse":
        print("abc1234")
elif tool == "docker":
    if os.environ.get("FAIL_PULL") == "1" and args[:2] == ["compose", "pull"]:
        sys.exit(1)
    if os.environ.get("STOP_DOCKER") == "1":
        sys.exit(23)
    if args[:2] == ["volume", "inspect"] and os.environ.get("MISSING_VOLUME") == "1":
        sys.exit(1)
    if args[:2] == ["image", "inspect"] and os.environ.get("MISSING_IMAGE") == "1":
        sys.exit(1)
    if args[:2] == ["compose", "images"]:
        print("sha256:test-image")
    if args[0] == "run":
        p = pathlib.Path("pre-upgrade-backups")
        p.mkdir(exist_ok=True)
        (p / "pre-upgrade-test.tar.gz").touch()
elif tool == "curl":
    print("true" if "ocr-health" in args[-1] else '{"ok":true}')
elif tool == "openssl":
    print("test-key-not-a-secret")
'''

class DeploymentPaths(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.bin = self.root / "bin"
        self.bin.mkdir()
        for name in ["git", "docker", "curl", "openssl"]:
            p = self.bin / name
            p.write_text(STUB)
            p.chmod(0o755)
        self.log = self.root / "commands.jsonl"
        self.env = {**os.environ, "PATH": str(self.bin) + ":" + os.environ["PATH"],
                    "COMMAND_LOG": str(self.log), "HOME": str(self.root)}
        self.env.pop("PROCURE_REPO", None)
        self.env.pop("RELEASE_TAG", None)

    def run_script(self, name, *args, **env):
        return subprocess.run(["bash", str(REPO / "deploy" / name), *args],
                              cwd=self.root, env={**self.env, **env},
                              capture_output=True, text=True, timeout=10)

    def repository(self, name):
        p = self.root / name
        p.mkdir()
        (p / ".git").mkdir()
        (p / "docker-compose.yml").write_text("services: {}\n")
        (p / "apps/server/prisma/migrations").mkdir(parents=True)
        (p / "apps/ocr").mkdir(parents=True)
        (p / "apps/ocr/models.sha256").write_text("test")
        (p / "apps/ocr/requirements.lock").write_text("test")
        (p / ".env").write_text("OCR_API_KEY=keep-me\nWEB_PORT=8080\n")
        return p

    def commands(self):
        return [json.loads(x) for x in self.log.read_text().splitlines()]

    def test_install_clones_environment_target_with_spaces(self):
        target = self.root / "custom install"
        r = self.run_script("deploy.sh", "9000", PROCURE_REPO=str(target))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("WEB_PORT=9000", (target / ".env").read_text())
        self.assertIn("RELEASE_TAG=sha-abc1234", (target / ".env").read_text())
        self.assertEqual((target / ".env").stat().st_mode & 0o777, 0o600)
        self.assertFalse((self.root / ".env").exists())
        calls = self.commands()
        self.assertTrue(any(c[0] == "git" and c[2][0] == "clone" for c in calls))
        self.assertTrue(any(c[0] == "docker" and c[1] == str(target)
                            and c[2][:2] == ["compose", "up"] for c in calls))

    def test_install_argument_wins_and_keeps_existing_key(self):
        target = self.repository("explicit")
        r = self.run_script("deploy.sh", "9001", str(target),
                            PROCURE_REPO=str(self.root / "wrong"))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("OCR_API_KEY=keep-me", (target / ".env").read_text())
        self.assertIn("WEB_PORT=9001", (target / ".env").read_text())
        self.assertIn("RELEASE_TAG=sha-abc1234", (target / ".env").read_text())
        self.assertFalse((self.root / "wrong").exists())

    def test_install_rejects_unrelated_existing_directory(self):
        target = self.root / "unrelated"
        target.mkdir()
        (target / "important").write_text("keep")
        r = self.run_script("deploy.sh", "8080", str(target))
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse((target / ".env").exists())
        self.assertEqual((target / "important").read_text(), "keep")

    def test_upgrade_default_does_not_select_source_checkout_or_home(self):
        self.repository("procure-lite")
        # Abort Docker preflight if /opt exists; otherwise the directory guard exits.
        r = self.run_script("upgrade.sh", "--no-pull", STOP_DOCKER="1")
        self.assertNotEqual(r.returncode, 0)
        self.assertIn("/opt/procure-lite", r.stdout + r.stderr)
        calls = self.commands() if self.log.exists() else []
        self.assertFalse(any(c[0] == "git" for c in calls))
        self.assertFalse(any(c[2][:2] == ["compose", "down"] for c in calls))

    def test_upgrade_argument_overrides_environment(self):
        target = self.repository("explicit upgrade")
        r = self.run_script("upgrade.sh", str(target), "--no-pull",
                            PROCURE_REPO=str(self.root / "wrong"))
        self.assertEqual(r.returncode, 0, r.stderr)
        calls = self.commands()
        self.assertIn("RELEASE_TAG=sha-abc1234", (target / ".env").read_text())
        self.assertTrue(any(c[2][:2] == ["compose", "up"] for c in calls))
        self.assertTrue(all(c[1] == str(target) for c in calls))
        self.assertFalse((self.root / "wrong").exists())

    def test_failed_pull_rebuilds_all_three_images(self):
        target = self.repository("fallback")
        r = self.run_script("upgrade.sh", str(target), "--no-pull", FAIL_PULL="1")
        self.assertEqual(r.returncode, 0, r.stderr)
        builds = [c[2] for c in self.commands() if c[2][:2] == ["compose", "build"]]
        self.assertEqual(len(builds), 1)
        self.assertEqual(builds[0][-3:], ["web", "server", "ocr"])
        self.assertTrue(any("/ready" in " ".join(c[2]) for c in self.commands()))

    def test_upgrade_preserves_untracked_local_configuration(self):
        target = self.repository("local-config")
        override = target / "docker-compose.override.yml"
        override.write_text("services: {}\n")
        r = self.run_script("upgrade.sh", str(target))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertEqual(override.read_text(), "services: {}\n")
        git_calls = [c[2] for c in self.commands() if c[0] == "git"]
        self.assertIn(["merge", "--ff-only", "origin/main"], git_calls)
        self.assertFalse(any(c[0] in ("reset", "clean") for c in git_calls))

    def test_upgrade_dirty_tracked_files_fail_before_stopping(self):
        target = self.repository("dirty")
        r = self.run_script("upgrade.sh", str(target), DIRTY_TRACKED="1")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(any(c[2][:2] == ["compose", "down"] for c in self.commands()))

    def test_upgrade_missing_volume_fails_before_stopping(self):
        target = self.repository("no-volume")
        r = self.run_script("upgrade.sh", str(target), MISSING_VOLUME="1")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(any(c[2][:2] == ["compose", "down"] for c in self.commands()))

    def rollback_artifacts(self, target):
        release = target / "pre-upgrade-backups/release-test"
        release.mkdir(parents=True)
        for name in ["state.tar.gz", "old-compose.yml", "release.txt"]:
            (release / name).write_text("fixture")
        (release / "old-images.yml").write_text("services:\n  server:\n    image: pinned-server:test\n")
        return release

    def test_rollback_missing_image_fails_before_stopping(self):
        target = self.repository("missing-rollback-image")
        release = self.rollback_artifacts(target)
        r = self.run_script("rollback.sh", str(target), str(release), MISSING_IMAGE="1")
        self.assertNotEqual(r.returncode, 0)
        self.assertFalse(any(c[2][:2] == ["compose", "down"] for c in self.commands()))

    def test_rollback_preserves_current_data_before_restore_and_uses_override(self):
        target = self.repository("rollback")
        release = self.rollback_artifacts(target)
        (target / "docker-compose.override.yml").write_text("services: {}\n")
        r = self.run_script("rollback.sh", str(target), str(release))
        self.assertEqual(r.returncode, 0, r.stderr)
        commands = [c[2] for c in self.commands()]
        backup_index = next(i for i, c in enumerate(commands) if "czf" in c)
        restore_index = next(i for i, c in enumerate(commands) if any("tar xzf" in x for x in c))
        self.assertLess(backup_index, restore_index)
        up = next(c for c in commands if "up" in c)
        self.assertIn(str(target / "docker-compose.override.yml"), up)
        self.assertIn(str(release / "old-images.yml"), up)

if __name__ == "__main__":
    unittest.main()
