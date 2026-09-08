"""Inject measurement-only hooks into a disposable Godot checkout, never the release."""
from pathlib import Path
import shutil
import sys

project = Path(sys.argv[1]).resolve()
source = Path(__file__).resolve().parent
for name in ['pacing_metrics.gd', 'pacing_capture.gd']:
    shutil.copyfile(source / name, project / 'scripts' / name)

def edit(name, old, new):
    path = project / 'scripts' / name
    text = path.read_text()
    if old not in text:
        raise RuntimeError(f'Missing instrument anchor: {name}: {old[:65]}')
    path.write_text(text.replace(old, new, 1))

def wrap(name, method, label):
    path = project / 'scripts' / name
    text = path.read_text()
    start = text.index('func ' + method + '(')
    body = text.index('\n', start) + 1
    end = text.find('\nfunc ', body)
    if end < 0: end = len(text)
    text = text[:body] + '\tvar _pacing_start: int = Time.get_ticks_usec()\n' + text[body:end].rstrip() + '\n\tPacingMetrics.record("' + label + '", _pacing_start)\n\n' + text[end:]
    path.write_text(text)

edit('main.gd', 'func _ready() -> void:\n', 'func _ready() -> void:\n\tif "--pacing" in OS.get_cmdline_user_args():\n\t\tget_tree().create_timer(.1).timeout.connect(_start_pacing)\n')
with (project / 'scripts/main.gd').open('a') as file:
    file.write('\nfunc _start_pacing() -> void:\n\tawait preload("res://scripts/pacing_capture.gd").run(self)\n')
# Normal bootstrap still loads the real project, assets, UI and network. Only
# the QA dispatcher is disabled; it must not switch to the old low Mesa profile.
edit('main.gd', 'if not qa_path.is_empty():', 'if not qa_path.is_empty() and "--pacing" not in OS.get_cmdline_user_args():')
edit('world.gd', '\t\tcontroller.update(motion,rendered_velocity,actor_clock,delta if id == hero_id or ambient_poses.has(id) else presentation_dt)', '\t\tif not PacingMetrics.freeze_animation:\n\t\t\tcontroller.update(motion,rendered_velocity,actor_clock,delta if id == hero_id or ambient_poses.has(id) else presentation_dt)')
edit('world.gd', '\tcamera_controller.update_pose(delta,hero_position,jump_offset)', '\tif PacingMetrics.rigid_camera: camera_controller.reset_follow()\n\tif not PacingMetrics.static_camera: camera_controller.update_pose(delta,hero_position,jump_offset)')
for file, method, label in [
    ('main.gd', '_process', 'input_ui'), ('main.gd', 'present_snapshot', 'hud_snapshot'),
    ('main.gd', 'refresh_quick', 'quickbar'), ('network.gd', '_process', 'network'),
    ('world.gd', '_process', 'world_process'), ('world.gd', '_physics_process', 'physics'),
    ('world.gd', 'apply_snapshot', 'world_snapshot'), ('world.gd', 'update_nameplates', 'nameplates'),
    ('world_weather.gd', '_process', 'weather'), ('reference_minimap.gd', '_draw', 'minimap_draw'),
]:
    wrap(file, method, label)
print('Installed disposable frame probes; production source was not edited.')
