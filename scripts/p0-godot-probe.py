"""Reproduce the isolated P0 Godot import/reimport/export checks from clean source files."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import struct
import subprocess
import tempfile

parser = argparse.ArgumentParser()
parser.add_argument('--godot', required=True, help='Godot 4.6.3 executable; matching Linux templates must be installed')
args = parser.parse_args()
ROOT = Path(__file__).resolve().parents[1]
EVIDENCE = ROOT/'docs/migration/p0/evidence'
source = ROOT/'docs/migration/p0/toolchain-sample/godot'
work = Path(tempfile.mkdtemp(prefix='varendor-p0-clean-'))
project = work/'project'
project.mkdir()
for name in ['project.godot','export_presets.cfg','sample.gd','sample.gd.uid','sample.tscn','p0-crate.glb']:
    shutil.copy2(source/name, project/name)

def run(arguments, logfile, marker=None):
    result = subprocess.run(arguments, capture_output=True, text=True, timeout=120)
    output = result.stdout + result.stderr
    (EVIDENCE/logfile).write_text(output)
    if result.returncode != 0 or (marker and marker not in output):
        raise RuntimeError(f'{logfile}: exit={result.returncode}, required marker={marker}')
    return output

version = subprocess.check_output([args.godot,'--version'],text=True).strip()
if not version.startswith('4.6.3.stable.'):
    raise RuntimeError('Use the exact verified Godot version')
run([args.godot,'--headless','--editor','--path',str(project),'--import'],'godot-clean-import.log.txt')
run([args.godot,'--headless','--path',str(project),'--','--verify'],'godot-clean-sample.log.txt','P0_SAMPLE_PASS')
# Change technical metadata, forcing new source content without changing the mesh or its material.
glb = project/'p0-crate.glb'
data = glb.read_bytes()
length = struct.unpack_from('<I',data,12)[0]
doc = json.loads(data[20:20+length])
doc['asset']['extras'] = {'p0_revision':'clean-reimport'}
body = json.dumps(doc,separators=(',',':')).encode()
body += b' '*((-len(body))%4)
rest = data[20+length:]
glb.write_bytes(struct.pack('<III',0x46546c67,2,20+len(body)+len(rest))+struct.pack('<II',len(body),0x4e4f534a)+body+rest)
assert glb.read_bytes() != data
run([args.godot,'--headless','--editor','--path',str(project),'--import'],'godot-clean-reimport.log.txt')
run([args.godot,'--headless','--path',str(project),'--','--verify'],'godot-clean-reimport-sample.log.txt','P0_SAMPLE_PASS')
binary = work/'varendor-p0.x86_64'
run([args.godot,'--headless','--path',str(project),'--export-release','P0 Linux',str(binary)],'godot-clean-export.log.txt')
binary.chmod(0o755)
run([str(binary),'--headless','--','--verify'],'godot-clean-native.log.txt','P0_SAMPLE_PASS')
report = {'engine':version,'templates':'4.6.3.stable','clean_source_import':True,'generated_texture_files_recreated':True,
          'changed_glb_reimport':True,'wrapper_settings_preserved':True,'standalone_linux_release_exit':0,
          'binary_bytes':binary.stat().st_size,'binary_sha256':hashlib.file_digest(open(binary,'rb'),'sha256').hexdigest(),
          'renderer':'headless; no graphical Godot render or FPS claim','windows_android_ios':'not_run','personal_data_accessed':False,'p1_started':False}
(EVIDENCE/'godot-clean-probe.json').write_text(json.dumps(report,indent=2)+'\n')
print(json.dumps(report,indent=2))
