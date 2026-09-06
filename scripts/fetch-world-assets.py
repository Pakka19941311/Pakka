"""Download only the reviewed source files, checking complete size and SHA-256."""
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import hashlib, json, shutil, sys, urllib.request

root=Path(__file__).resolve().parents[1]
target=Path(sys.argv[1])
manifest=json.loads((root/'docs/assets/world-source-manifest.json').read_text())
def matches(path, record):
    if not path.is_file() or path.stat().st_size!=record['bytes']:return False
    with path.open('rb') as file:return hashlib.file_digest(file,'sha256').hexdigest()==record['sha256']
def download(record):
    path=target/record['path']
    if matches(path,record):return
    if not record['url'].startswith('https://dl.polyhaven.org/file/ph-assets/'):raise ValueError('Unreviewed source URL')
    path.parent.mkdir(parents=True,exist_ok=True);temporary=path.with_suffix(path.suffix+'.download')
    with urllib.request.urlopen(record['url'],timeout=120) as response,temporary.open('wb') as file:shutil.copyfileobj(response,file,4*1024*1024)
    if not matches(temporary,record):raise ValueError('Source changed: '+record['path'])
    temporary.replace(path);print('Verified',record['path'],flush=True)
with ThreadPoolExecutor(max_workers=4) as pool:list(pool.map(download,manifest['files']))
