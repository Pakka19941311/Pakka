import argparse,hashlib,json
from pathlib import Path
p=argparse.ArgumentParser();p.add_argument('--intake',required=True);a=p.parse_args()
root=Path(a.intake);manifest=json.loads(Path(__file__).with_name('sources.json').read_text(encoding='utf-8'))
for row in manifest['sources']:
 source=root/row['cache_file']
 assert source.is_file(),f'Missing {source}'
 assert hashlib.sha256(source.read_bytes()).hexdigest()==row['sha256'],f'Source hash mismatch: {source}'
 print('VERIFIED',row['id'])
