"""Preserve actual Godot captures and checks; distinguish partial art acceptance."""
from pathlib import Path
import json,shutil,hashlib
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[2];QA=ROOT/'qa-artifacts/world-final';EVIDENCE=ROOT/'docs/world-final/evidence'
for revision in ['D01','D02','D03']:
    src=QA/f'frames-{revision}';dst=EVIDENCE/f'{revision}-forest';dst.mkdir(parents=True,exist_ok=True)
    for name in ['nature-review.json','forest-trail-start.png','forest-trail-stop.png','canopy-alpha-mask.png','forest-overview.png']:
        if (src/name).exists():shutil.copy2(src/name,dst/name)
    for prefix in ['import-','run-']:
        launch=QA/(prefix+revision);out=EVIDENCE/'launches'/(prefix+revision);out.mkdir(parents=True,exist_ok=True)
        for name in ['result.json','stderr.log']:shutil.copy2(launch/name,out/name.replace('.log','.txt'))
for folder in ['appearance-D03','main-after-D03']:
    out=EVIDENCE/'launches'/folder;out.mkdir(parents=True,exist_ok=True)
    for name in ['result.json','stderr.log']:shutil.copy2(QA/folder/name,out/name.replace('.log','.txt'))
src=QA/'frames-D03';dst=EVIDENCE/'D03-forest'
for path in (QA/'appearance-frames-D03').glob('*'):shutil.copy2(path,dst/path.name)
report=json.loads((src/'nature-review.json').read_text());times=report['frame_times_ms']
frames=[Image.open(src/f'frame-{i:05}.jpg').convert('RGB').resize((960,540)) for i in range(report['frames'])]
durations=[max(1,b-a) for a,b in zip(times,times[1:])]+[100]
frames[0].save(dst/'forest-walk.webp',save_all=True,append_images=frames[1:],duration=durations,loop=0,quality=76,method=5)
indices=[0,20,40,60,80,100,120,len(frames)-1];sheet=Image.new('RGB',(1280,400),'#121519')
for n,index in enumerate(indices):
    frame=frames[index].resize((320,180));sheet.paste(frame,((n%4)*320,(n//4)*200))
    # Keep a second row of original snapshots with their actual elapsed times.
    ImageDraw.Draw(sheet).text(((n%4)*320+8,(n//4)*200+184),f'frame {index} / {(times[index]-times[0])/1000:.2f} s',fill='white')
sheet.save(dst/'motion-contact.jpg',quality=91)
inspection={'geometry_defect':'Opaque atlas padding was inside old rectangular twig cards; D03 clips the card UV footprint around the existing alpha island. Original texture pixels are unchanged.',
    'source_wood':'Recovered original bark/trunk/dead-branch buffer views, separate D02 native master; originals retained.',
    'canopy_measured_fraction':report['canopy']['fraction'],'target':[.75,.90],'normal_walk_pass':report['all_pass'],'frames':report['frames'],
    'renderer':'Godot 4.6.3 Compatibility, actual viewport capture','main_startup':'exit 0, headless only',
    'still_open':['Cross-trail camera orbit can hide the hero behind branches; solve locally in nature visuals, preserve existing camera control.','Understorey needs roots, litter, deadwood and more varied grouping.','No whole-world vegetation, snow/cliff/swamp nature or ancient-tree final sculpt yet.','No main-game world migration or final performance acceptance.'],
    'full_world_acceptance':False}
(dst/'visual-inspection.json').write_text(json.dumps(inspection,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'evidence':str(dst),'frames':len(frames),'walk_duration_ms':sum(durations),'canopy':report['canopy']['fraction']}))
