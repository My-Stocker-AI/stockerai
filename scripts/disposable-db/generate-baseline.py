"""Generate LOCAL-ONLY schema SQL from the read-only catalog capture (no row data).

This is not a production migration. Platform auth/storage schemas come from the
local Supabase images; their system triggers are not replaced by this capture.
"""
import csv
import hashlib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
EVIDENCE = ROOT / "docs/remediation/evidence"
DEST = ROOT / ".test-runtime/disposable/supabase/migrations/20260918000000_captured_public.sql"


def ident(value):
    return '"' + value.replace('"', '""') + '"'


def literal(value):
    return "'" + value.replace("'", "''") + "'"


def generate():
    columns_path = EVIDENCE / "2026-09-18-public-columns.csv"
    catalog_path = EVIDENCE / "2026-09-18-public-catalog.csv"
    with columns_path.open(encoding="utf-8-sig", newline="") as f:
        tables = list(csv.DictReader(f))
    with catalog_path.open(encoding="utf-8-sig", newline="") as f:
        catalog = {r['category']: json.loads(r['metadata']) for r in csv.DictReader(f) if r['category'] != 'version'}
    sql = ["-- LOCAL TEST BASELINE ONLY. Never apply to a hosted project.",
           "SET search_path = public, extensions;", "SET check_function_bodies = off;"]
    enums = {}
    for enum in catalog['enums']:
        enums.setdefault(enum['typname'], []).append(enum)
    for name, entries in enums.items():
        labels = ', '.join(literal(e['enumlabel']) for e in sorted(entries, key=lambda e: e['enumsortorder']))
        sql.append(f"CREATE TYPE public.{ident(name)} AS ENUM ({labels});")
    for table in tables:
        fields = []
        for column in json.loads(table['columns']):
            definition = f"{ident(column['name'])} {column['type']}"
            if column['default'] is not None:
                definition += f" DEFAULT {column['default']}"
            if column['not_null']:
                definition += " NOT NULL"
            fields.append(definition)
        sql.append(f"CREATE TABLE public.{ident(table['table_name'])} (\n  " + ',\n  '.join(fields) + '\n);')
    # Referenced primary/unique keys must exist before adding foreign keys.
    for constraint in sorted(catalog['constraints'], key=lambda c: c['contype'] == 'f'):
        relation = constraint['relation']
        if relation.startswith('public.'):
            relation = relation[7:]
        if '.' in relation:
            raise ValueError(f"Unexpected non-public constraint: {relation}")
        sql.append(f"ALTER TABLE public.{ident(relation)} ADD CONSTRAINT {ident(constraint['conname'])} {constraint['definition']};")
    for function in catalog['functions']:
        # Reviewed capture contains no external HTTP/dblink calls. Refuse unexpected
        # network-capable definitions if a later capture changes that assumption.
        if any(s in function['definition'].lower() for s in ['https://', 'http://', 'dblink', 'net.http']):
            raise ValueError(f"Review external dependency in {function['proname']}")
        sql.append(function['definition'].rstrip(';\r\n') + ';')
    backed_indexes = {c['conname'] for c in catalog['constraints'] if c['contype'] in ('p', 'u', 'x')}
    for index in catalog['indexes']:
        if index['indexname'] not in backed_indexes:
            sql.append(index['indexdef'] + ';')
    for trigger in catalog['triggers']:
        if not trigger['relation'].startswith('storage.'):
            sql.append(trigger['definition'] + ';')
            if trigger['tgenabled'] != 'O':
                raise ValueError('Review non-default trigger enablement')
    for table in tables:
        if table['rls'].lower() == 'true':
            sql.append(f"ALTER TABLE public.{ident(table['table_name'])} ENABLE ROW LEVEL SECURITY;")
    for policy in catalog['policies']:
        # Keep platform storage policies outside the picking test baseline.
        if policy['schemaname'] != 'public':
            continue
        roles = ', '.join('PUBLIC' if r == 'public' else ident(r) for r in policy['roles'])
        statement = (f"CREATE POLICY {ident(policy['policyname'])} ON public.{ident(policy['tablename'])} "
                     f"AS {policy['permissive']} FOR {policy['cmd']} TO {roles}")
        if policy['qual']:
            statement += f" USING ({policy['qual']})"
        if policy['with_check']:
            statement += f" WITH CHECK ({policy['with_check']})"
        sql.append(statement + ';')
    for grant in catalog['grants']:
        if grant['table_schema'] == 'public' and grant['table_name'] in {t['table_name'] for t in tables}:
            role = 'PUBLIC' if grant['grantee'] == 'PUBLIC' else ident(grant['grantee'])
            suffix = ' WITH GRANT OPTION' if grant['is_grantable'] == 'YES' else ''
            sql.append(f"GRANT {grant['privilege_type']} ON public.{ident(grant['table_name'])} TO {role}{suffix};")
    sql.append('SET check_function_bodies = on;')
    sql.extend([
        "CREATE FUNCTION public.stockerai_disposable_marker() RETURNS text LANGUAGE sql AS $$ SELECT 'stockerai-local-only-20260918'::text $$;",
        "REVOKE ALL ON FUNCTION public.stockerai_disposable_marker() FROM PUBLIC, anon, authenticated;",
        "GRANT EXECUTE ON FUNCTION public.stockerai_disposable_marker() TO service_role;",
    ])
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text('\n\n'.join(sql) + '\n', encoding='utf-8')
    print(json.dumps({'tables': len(tables), 'functions': len(catalog['functions']),
                      'sql_sha256': hashlib.sha256(DEST.read_bytes()).hexdigest(),
                      'output': str(DEST.relative_to(ROOT))}))


if __name__ == '__main__':
    generate()
