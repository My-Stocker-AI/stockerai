"""Block common credential material in tracked files; never print matched values.

This focused publication guard is not a historical scan or credential revocation.
Supabase anon JWTs are deliberately public; all other realistic JWTs are rejected.
"""
import base64
import json
from pathlib import Path
import re
import subprocess
import sys

JWT = re.compile(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16,}")
PATTERNS = {
    "private-key": re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED )?PRIVATE KEY-----"),
    "provider-token": re.compile(r"\b(?:sbp_|sb_secret_|sk_live_|rk_live_|ghp_|github_pat_|sk-proj-)[A-Za-z0-9_-]{20,}"),
}


def findings(name: str, content: str) -> list[tuple[int, str]]:
    result = []
    basename = name.replace("\\", "/").rsplit("/", 1)[-1]
    if basename == ".mcp.json" or (
        (basename == ".env" or basename.startswith(".env."))
        and basename not in {".env.example", ".env.sample", ".env.template"}
    ):
        result.append((1, "credential-file"))
    for match in JWT.finditer(content):
        try:
            payload = json.loads(base64.urlsafe_b64decode(match.group().split(".")[1] + "==="))
            public = isinstance(payload, dict) and payload.get("role") == "anon"
        except (ValueError, UnicodeError):
            public = False
        if not public:
            result.append((content.count("\n", 0, match.start()) + 1, "non-public-jwt"))
    for category, pattern in PATTERNS.items():
        for match in pattern.finditer(content):
            result.append((content.count("\n", 0, match.start()) + 1, category))
    return sorted(set(result))


def main() -> int:
    root = Path(subprocess.check_output(["git", "rev-parse", "--show-toplevel"], text=True).strip())
    names = subprocess.check_output(["git", "ls-files", "-z"], cwd=root).decode().split("\0")
    failed = False
    for name in filter(None, names):
        path = root / name
        if not path.exists():
            print(f"{name}:1: tracked-file-unreadable (stage its deletion or restore it)")
            failed = True
            continue
        content = path.read_bytes().decode("utf-8", errors="replace")
        for line, category in findings(name, content):
            print(f"{name}:{line}: {category} (value withheld)")
            failed = True
    print("Credential publication guard FAILED." if failed else "Credential publication guard passed.")
    return int(failed)


if __name__ == "__main__":
    sys.exit(main())
