"""Apply keyword RPC authority hardening only to the marked disposable DB."""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
PSQL = [
    "docker", "exec", "-i", "supabase_db_stockerai-disposable",
    "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1",
]


if __name__ == "__main__":
    marker = subprocess.check_output(
        PSQL + ["-Atc", "SELECT public.stockerai_disposable_marker()"],
        text=True,
    ).strip()
    if marker != "stockerai-local-only-20260918":
        raise SystemExit("Refusing an unmarked database")
    migration = (
        ROOT
        / "supabase/migrations/20261001000000_bind_keyword_functions_to_caller.sql"
    )
    subprocess.run(
        PSQL,
        input=migration.read_text(encoding="utf-8"),
        text=True,
        check=True,
    )
