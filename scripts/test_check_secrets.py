"""Synthetic fixtures only: never use or contact a real credential provider."""
import base64
import importlib.util
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("check_secrets", Path(__file__).with_name("check-secrets.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)


def token(payload):
    encode = lambda value: base64.urlsafe_b64encode(json.dumps(value).encode()).decode().rstrip("=")
    return ".".join([encode({"alg": "HS256"}), encode(payload), "synthetic_signature_not_valid"])


class PublicationGuardTests(unittest.TestCase):
    def test_privileged_jwt_in_ordinary_filename(self):
        self.assertEqual(guard.findings("workflow.js", "\n" + token({"role": "service_role"})), [(2, "non-public-jwt")])

    def test_user_and_non_supabase_tokens_blocked(self):
        for payload in [{"role": "authenticated"}, {"sub": "synthetic"}, []]:
            self.assertTrue(guard.findings("notes.md", token(payload)))

    def test_public_anon_key_allowed(self):
        self.assertEqual(guard.findings("client.ts", token({"role": "anon"})), [])

    def test_malformed_realistic_token_blocked(self):
        self.assertTrue(guard.findings("notes.md", "eyJ" + "invalid.invalid." + "x" * 24))

    def test_credential_filenames_blocked_even_if_empty(self):
        for name in [".mcp.json", "nested/.env", "nested/.env.production", "nested\\.env.local"]:
            self.assertIn((1, "credential-file"), guard.findings(name, ""))

    def test_examples_still_scanned(self):
        self.assertEqual(guard.findings(".env.example", "KEY=placeholder"), [])
        self.assertTrue(guard.findings(".env.example", token({"role": "service_role"})))

    def test_provider_tokens_and_private_keys_blocked(self):
        for prefix in ["sbp_", "sb_secret_", "sk_live_", "rk_live_", "ghp_", "github_pat_", "sk-proj-"]:
            self.assertTrue(guard.findings("config.txt", prefix + "x" * 30))
        self.assertTrue(guard.findings("key.pem", "-----BEGIN " + "PRIVATE KEY-----"))

    def test_diagnostics_contain_no_secret(self):
        secret = token({"role": "service_role"})
        self.assertNotIn(secret, str(guard.findings("config.txt", secret)))

    def test_cli_fails_without_disclosing_value_and_recovers_after_removal(self):
        script = str(Path(__file__).with_name("check-secrets.py").resolve())
        secret = token({"role": "service_role"})
        with tempfile.TemporaryDirectory() as directory:
            subprocess.run(["git", "init", "-q", directory], check=True)
            fixture = Path(directory) / "ordinary.txt"
            fixture.write_text(secret, encoding="utf-8")
            subprocess.run(["git", "add", "ordinary.txt"], cwd=directory, check=True)
            result = subprocess.run([sys.executable, script], cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)
            self.assertIn("ordinary.txt:1: non-public-jwt", result.stdout)
            self.assertNotIn(secret, result.stdout + result.stderr)
            fixture.write_text(token({"role": "anon"}), encoding="utf-8")
            result = subprocess.run([sys.executable, script], cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0)
            fixture.unlink()
            result = subprocess.run([sys.executable, script], cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 1)


if __name__ == "__main__":
    unittest.main()
