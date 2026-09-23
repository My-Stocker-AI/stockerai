"""Build deterministic single-file dashboard uploads from the tested shared handler.

No service access or deployment. Output is ignored local release material.
"""
import hashlib
from pathlib import Path

root = Path(__file__).resolve().parents[1]
shared = (root / 'supabase/functions/_shared/legacy-picking.ts').read_text(encoding='utf-8')
for name in ['get-current-status-optimized', 'get-next-item-atomic', 'get-next-item-data']:
    entry = (root / 'supabase/functions' / name / 'index.ts').read_text(encoding='utf-8')
    marker = 'import { legacyPickingHandler } from "../_shared/legacy-picking.ts";'
    if entry.count(marker) != 1:
        raise SystemExit(f'Unexpected source layout: {name}')
    rendered = entry.replace(marker, shared.rstrip())
    output = root / '.test-runtime/edge-release' / name / 'index.ts'
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(rendered, encoding='utf-8', newline='\n')
    print(name, hashlib.sha256(output.read_bytes()).hexdigest())
