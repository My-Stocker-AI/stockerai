"""Apply only the reviewed progress migration to the marked disposable container."""
import pathlib
import subprocess

ROOT = pathlib.Path(__file__).resolve().parents[2]
CONTAINER = 'supabase_db_stockerai-disposable'
PSQL = ['docker', 'exec', '-i', CONTAINER, 'psql', '-U', 'postgres', '-d', 'postgres', '-v', 'ON_ERROR_STOP=1']


def main():
    marker = subprocess.check_output(PSQL + ['-Atc', 'SELECT public.stockerai_disposable_marker()'], text=True).strip()
    if marker != 'stockerai-local-only-20260918':
        raise SystemExit('Refusing an unmarked database')
    path = ROOT / 'supabase/migrations/20260922000000_atomic_advance_picking.sql'
    subprocess.run(PSQL, input=path.read_text(encoding='utf-8'), text=True, check=True)


if __name__ == '__main__':
    main()
