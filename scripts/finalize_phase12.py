from pathlib import Path
import re

root = Path(__file__).resolve().parents[1]
test_path = root / 'tests' / 'source-contract.test.mjs'
text = test_path.read_text(encoding='utf-8')
pattern = r"\ntest\('presentation guardrails suppress the prototype combat glow without touching combat logic',[\s\S]*?\n\}\);\n"
updated, count = re.subn(pattern, '\n', text, count=1, flags=re.S)
if count != 1:
    raise RuntimeError(f'expected obsolete guardrail test once, got {count}')
test_path.write_text(updated, encoding='utf-8')

# Remove one-shot migration plumbing from the product commit.
for relative in [
    '.github/workflows/apply-phase12.yml',
    '.github/workflows/apply-phase12-v2.yml',
    'scripts/apply_phase12.py',
    'scripts/finalize_phase12.py',
]:
    path = root / relative
    if path.exists():
        path.unlink()
