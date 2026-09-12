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
    elif args[0] == "rev-parse":
        print("abc1234")
elif tool == "docker":
    if os.environ.get("STOP_DOCKER") == "1":
        sys.exit(23)
    if args[:2] == ["volume", "ls"]:
        print("procure-lite_procure-state")
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

    def run_script(self, name, *args, **env):
        return subprocess.run(["bash", str(REPO / "deploy" / name), *args],
                              cwd=self.root, env={**self.env, **env},
                              capture_output=True, text=True, timeout=10)

    def repository(self, name):
        p = self.root / name
        p.mkdir()
        (p / ".git").mkdir()
        (p / "docker-compose.yml").write_text("services: {}\n")
        (p / ".env").write_text("OCR_API_KEY=keep-me\nWEB_PORT=8080\n")
        return p

    def commands(self):
        return [json.loads(x) for x in self.log.read_text().splitlines()]

    def test_install_clones_environment_target_with_spaces(self):
        target = self.root / "custom install"
        r = self.run_script("deploy.sh", "9000", PROCURE_REPO=str(target))
        self.assertEqual(r.returncode, 0, r.stderr)
        self.assertIn("WEB_PORT=9000", (target / ".env").read_text())
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
        self.assertTrue(any(c[2][:2] == ["compose", "up"] for c in calls))
        self.assertTrue(all(c[1] == str(target) for c in calls))
        self.assertFalse((self.root / "wrong").exists())

if __name__ == "__main__":
    unittest.main()
