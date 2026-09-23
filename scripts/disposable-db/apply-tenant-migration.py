"""Apply the tenant-ownership draft only to the marked disposable database."""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
PSQL = ['docker', 'exec', '-i', 'supabase_db_stockerai-disposable', 'psql',
        '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']

if __name__ == '__main__':
    marker = subprocess.check_output(
        PSQL + ['-Atc', 'SELECT public.stockerai_disposable_marker()'], text=True
    ).strip()
    if marker != 'stockerai-local-only-20260918':
        raise SystemExit('Refusing an unmarked database')
    migration = ROOT / 'supabase/migrations/20260925000000_tenant_route_ownership.sql'
    subprocess.run(PSQL, input=migration.read_text(), text=True, check=True)
