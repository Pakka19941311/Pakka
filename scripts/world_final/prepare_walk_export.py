"""CI-only export configuration for the existing project's exploration scene."""
from pathlib import Path
import json, os, re
ROOT=Path(__file__).resolve().parents[2]
assert os.environ.get('CI')=='true','Only alter the disposable CI checkout'
project=ROOT/'godot-pc'
config=project/'project.godot'
text=config.read_text('utf-8')
assert 'run/main_scene="res://main.tscn"' in text
text=text.replace('run/main_scene="res://main.tscn"','run/main_scene="res://world-final/preview_menu.tscn"')
config.write_text(text,encoding='utf-8')
presets=project/'export_presets.cfg'
raw=[p.relative_to(project).as_posix() for folder in ['world-final','generated','data','tests'] for p in (project/folder).rglob('*') if p.suffix in ['.json','.f32']]
# Explicit paths avoid ambiguity in recursive include-filter glob semantics.
text=re.sub(r'include_filter="[^"]*"','include_filter="'+','.join(sorted(raw))+'"',presets.read_text('utf-8'))
presets.write_text(text,encoding='utf-8')
print(json.dumps({'main':'world-final/preview_menu.tscn','raw_files_included':len(raw),'personal_saves_packaged':False}))
