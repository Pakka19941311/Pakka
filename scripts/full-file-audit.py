"""Inventory every tracked file and validate formats without executing project tools.

An integrity pass is not a visual or behavioral approval. Runtime checks and
manual review are recorded separately in the audit ledger. No matched secret
text is ever included in the report.
"""
import argparse
import ast
from collections import Counter
from concurrent.futures import ThreadPoolExecutor
import hashlib
import io
import json
from pathlib import Path
import re
import struct
import subprocess
import xml.etree.ElementTree as ET
import zipfile

TEXT = {'.ts', '.mjs', '.js', '.gd', '.gdshader', '.gdshaderinc', '.py', '.md',
        '.json', '.gltf', '.svg', '.html', '.css', '.yml', '.yaml', '.txt', '.log',
        '.tscn', '.tres', '.cfg', '.godot', '.import', '.uid', '.ps1', '.bat',
        '.sh', '.csv', '.xml'}
SECRETS = {
    'private-key': re.compile(r'-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----'),
    'github-token': re.compile(r'\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{70,})\b'),
    'aws-access-key': re.compile(r'\bAKIA[0-9A-Z]{16}\b'),
}

def validate_glb(data):
    magic, version, length = struct.unpack_from('<III', data)
    if magic != 0x46546c67 or version != 2 or length != len(data):
        raise ValueError('invalid GLB header or file length')
    offset, chunks, doc, binary = 12, 0, None, None
    while offset < length:
        size, kind = struct.unpack_from('<II', data, offset)
        offset += 8
        if size % 4 or offset + size > length:
            raise ValueError('invalid GLB chunk bounds/alignment')
        if chunks == 0:
            if kind != 0x4e4f534a:
                raise ValueError('first GLB chunk is not JSON')
            doc = json.loads(data[offset:offset+size])
        elif kind == 0x004e4942:
            binary = size
        chunks += 1
        offset += size
    if offset != length or doc is None:
        raise ValueError('invalid GLB chunk closure')
    buffers = doc.get('buffers', [])
    for index, buffer in enumerate(buffers):
        size = buffer['byteLength']
        if not isinstance(size, int) or size < 0:
            raise ValueError('invalid GLB buffer size')
        if index == 0 and not buffer.get('uri') and (binary is None or size > binary):
            raise ValueError('GLB BIN chunk shorter than declared buffer')
    for view in doc.get('bufferViews', []):
        if view.get('byteOffset', 0) < 0 or view['byteLength'] < 0 or view.get('byteOffset', 0) + view['byteLength'] > buffers[view['buffer']]['byteLength']:
            raise ValueError('GLB bufferView outside its buffer')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', required=True)
    parser.add_argument('--node')
    args = parser.parse_args()
    root = Path.cwd()
    paths = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode('utf8').split('\0')
    paths = sorted(set(path for path in paths if path))
    try:
        from PIL import Image
    except ImportError:
        Image = None
    entries, findings = [], []
    for relative in paths:
        path, checks = root / relative, ['sha256']
        entry = {'path': relative, 'checks': checks}
        entries.append(entry)
        try:
            data = path.read_bytes()
            suffix = path.suffix.lower()
            entry.update(bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), extension=suffix)
            if suffix in TEXT or path.name in {'.gitignore', '.gitattributes', 'LICENSE'}:
                source = data.decode('utf-8-sig')
                checks.append('utf8')
                for kind, pattern in SECRETS.items():
                    for match in pattern.finditer(source):
                        findings.append({'path': relative, 'line': source.count('\n', 0, match.start()) + 1, 'kind': kind, 'severity': 'review'})
            if suffix in {'.json', '.gltf'}:
                json.loads(data.decode('utf-8-sig')); checks.append('json-parse')
            elif suffix == '.py':
                ast.parse(data.decode('utf-8-sig'), filename=relative); checks.append('python-ast')
            elif suffix in {'.svg', '.xml'}:
                ET.fromstring(data); checks.append('xml-parse')
            elif suffix == '.glb':
                validate_glb(data); checks.append('glb-chunks-buffer-bounds')
            elif suffix in {'.png', '.jpg', '.jpeg', '.webp'} and Image:
                with Image.open(io.BytesIO(data)) as pic:
                    entry['image_size'] = list(pic.size)
                    pic.verify()
                checks.append('image-verify')
            elif suffix in {'.zip', '.docx', '.npz'}:
                with zipfile.ZipFile(io.BytesIO(data)) as archive:
                    if archive.testzip() is not None:
                        raise ValueError('archive CRC mismatch')
                checks.append('zip-crc')
            elif suffix == '.f32':
                if len(data) % 4:
                    raise ValueError('float32 byte alignment')
                checks.append('float32-alignment')
            entry['status'] = 'integrity-pass'
        except Exception as exc:
            entry['status'] = 'failed'
            findings.append({'path': relative, 'kind': 'format', 'severity': 'error', 'error': str(exc)[:200]})
    if args.node:
        scripts = [entry for entry in entries if Path(entry['path']).suffix in {'.mjs', '.js'}]
        def check_js(entry):
            result = subprocess.run([args.node, '--check', entry['path']], cwd=root, capture_output=True, timeout=25,
                                    creationflags=getattr(subprocess, 'CREATE_NO_WINDOW', 0))
            return entry, result.returncode
        with ThreadPoolExecutor(max_workers=3) as pool:
            for entry, code in pool.map(check_js, scripts):
                entry['checks'].append('node-syntax')
                if code:
                    entry['status'] = 'failed'
                    findings.append({'path': entry['path'], 'kind': 'javascript-syntax', 'severity': 'error', 'exit_code': code})
    summary = {'tracked_files': len(entries), 'tracked_bytes': sum(e.get('bytes', 0) for e in entries),
               'extensions': dict(Counter(e.get('extension', '') for e in entries)),
               'checks': dict(Counter(check for entry in entries for check in entry['checks'])),
               'errors': sum(f['severity'] == 'error' for f in findings),
               'review_findings': sum(f['severity'] == 'review' for f in findings),
               'limits': ['Integrity and syntax are not gameplay or visual approval.',
                          'Shader compilation, GLB animations, collision behavior and native UI require engine checks.',
                          'Split payload manifests and installed dependency advisories are checked separately.']}
    output = Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps({'summary': summary, 'findings': findings, 'files': entries}, ensure_ascii=False, indent=2), encoding='utf8')
    print(json.dumps(summary, ensure_ascii=False))
    print(json.dumps(findings, ensure_ascii=False))
    return 1 if summary['errors'] else 0

if __name__ == '__main__':
    raise SystemExit(main())
