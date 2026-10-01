"""Apply atomic route upload only to the explicitly marked disposable database."""
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
    # This helper is for iterative validation only. Reset the candidate objects after
    # proving the target is the disposable database; the production migration itself
    # remains forward-only and contains no destructive test setup.
    subprocess.run(
        PSQL,
        input="""
DROP FUNCTION IF EXISTS public.replace_route_upload(
  uuid, uuid, uuid, uuid, text, text, date, text, text, jsonb
);
DROP FUNCTION IF EXISTS public.record_pending_format_upload(
  uuid, uuid, uuid, uuid, text, text, text, text, text, text
);
DROP TABLE IF EXISTS public.route_upload_operations;
""",
        text=True,
        check=True,
    )
    migration = ROOT / "supabase/migrations/20261003000000_atomic_route_upload.sql"
    subprocess.run(
        PSQL,
        input=migration.read_text(encoding="utf-8"),
        text=True,
        check=True,
    )
