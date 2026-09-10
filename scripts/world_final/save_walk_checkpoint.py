"""Record the playable preview gate without marking the world finished."""
from pathlib import Path
import json,shutil,subprocess
from PIL import Image
ROOT=Path(__file__).resolve().parents[2]
remote=json.loads(subprocess.check_output(['git','show','6fd7d6aba1dbcc6251b64b57c57c25a01112ad19:WORLD_STATE.json'],cwd=ROOT))
state=json.loads((ROOT/'WORLD_STATE.json').read_text('utf-8'))
for key in ['storage_block','D13','D14']:state[key]=remote[key]
state['storage_block']['resolved']='Owner freed C drive; closed archive verified against every source, incomplete parts backed up and recovered; clean restore 923 files passed.'
state['storage_block']['archive_validation_pending']=False
state['storage_block']['recovery_backup']='outputs/world-preview-recovery (relative to workspace; outside repository)'
state['D14']['backup']='outputs/world-preview-recovery; native and GLB verified'
state['publication']['pending']='D13 sources, preserved D14 candidate and interactive walking preview are queued for GitHub publication and Actions. No final-world acceptance.'
state['next_task']='FIRST finish GitHub Actions Windows intermediate world-walk Release and give direct ZIP link. THEN resume D14 ancient tree actual Godot approach/hollow/return inspection, refine unfinished nature; continue E-H.'
state['passed_checks']['payload_clean_restore_923']=True
dest=ROOT/'docs/world-final/evidence/walk-preview';dest.mkdir(parents=True,exist_ok=True)
reports={}
for name,run in [('surface','walk-preview-surface-02'),('mine','walk-preview-mine-01'),('great_cave','walk-preview-cave-01')]:
    folder=ROOT/'qa-artifacts/world-final'/run
    report=json.loads((folder/'preview-qa.json').read_text('utf-8'))
    assert report['ok'] and not report['headless']
    reports[name]=report
    shutil.copy2(folder/'preview-qa.json',dest/(name+'-preview-qa.json'))
    result=json.loads((folder/'result.json').read_text('utf-8'))
    summary={key:result[key] for key in ['operation_completed','exit_code','timed_out','elapsed_s','crash_detected']}
    summary.update(operation='Interactive world exploration, '+name,engine='Godot 4.6.3',raw_host_telemetry_published=False)
    for filename in ['launch.json','result.json']:
        (dest/(name+'-'+filename)).write_text(json.dumps(summary,indent=2)+'\n',encoding='utf-8')
    for frame in ['start','walk-60','stop']:
        im=Image.open(folder/(frame+'.png'));im.thumbnail((1600,900));im.convert('RGB').save(dest/(name+'-'+frame+'.jpg'),quality=86)
state['intermediate_walk']={'scope':'User explicitly requested a playable intermediate FIRST, before more art. Surface/mine/cave menu in existing project; no server or save I/O.','scene':'godot-pc/world-final/preview_menu.tscn','release':'pending','local_graphics_checks':reports,'ci_windows_binary_checks':'pending','limits':['D13 art unfinished','No population, combat, NPC, inventory or map in exploration mode','Existing main game retained with its working systems; scene selection changes only in disposable CI checkout']}
(ROOT/'WORLD_STATE.json').write_text(json.dumps(state,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'reports':list(reports),'all_ok':True,'state':'WORLD_STATE.json'}))
