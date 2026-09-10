"""Validate the supplied FINAL package and build an editable reference overlay.
The overlay is planning evidence, never a screenshot of the finished game.
"""
from pathlib import Path
import csv, hashlib, html, json, math

ROOT = Path(__file__).resolve().parents[2]
DOC = ROOT/'docs/world-final'
SPEC = DOC/'spec'

def main():
    manifest=json.loads((SPEC/'PACKAGE_MANIFEST.json').read_text('utf-8'))
    verified=[]
    for f in manifest['files']:
        data=(SPEC/f['path']).read_bytes()
        assert len(data)==f['size_bytes'] and hashlib.sha256(data).hexdigest()==f['sha256'], f['path']
        verified.append(f['path'])
    layout=json.loads((ROOT/'godot-pc/world-final/world_layout.json').read_text('utf-8'))
    locations=layout['locations']; objects=layout['objects']; roads=layout['roads']
    assert len(locations)==12
    assert sum(l['regular'] for l in locations)==997
    assert sum(l['bosses'] for l in locations)==3
    assert len({o['id'] for o in objects})==len(objects)
    assert len({r['id'] for r in roads})==len(roads)
    assert layout['constraints']['width_m']==1600 and layout['constraints']['depth_m']==1400
    ids={l['id'] for l in locations}
    for o in objects:
        x,y,z=o['position']; assert -800<=x<=800 and -700<=z<=700 and o['location_id'] in ids
    grades=[]
    for road in roads:
        maximum=0
        for a,b in zip(road['points_xyz'],road['points_xyz'][1:]):
            dx,dz=b[0]-a[0],b[2]-a[2]
            angle=math.degrees(math.atan2(abs(b[1]-a[1]),math.hypot(dx,dz)))
            maximum=max(maximum,angle)
        grades.append({'id':road['id'],'max_authored_segment_slope_degrees':round(maximum,2),
                       'requires_B_route_adjustment':maximum>20})
    (DOC/'layout-checks.json').write_text(json.dumps({'stage_A_data_valid':True,'package_hashes_verified':verified,
       'locations':12,'ordinary_capacity':997,'boss_capacity':3,'fixed_objects':len(objects),
       'roads':grades,'playable_geometry_verified':False,'visual_acceptance':False},ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    with (DOC/'LANDMARK_REGISTRY.csv').open('w',newline='',encoding='utf-8-sig') as f:
        writer=csv.writer(f);writer.writerow(['id','location_id','kind','x','y','z','width','height','depth','reference_x','reference_y','confidence','status'])
        for o in objects:writer.writerow([o['id'],o['location_id'],o['kind'],*o['position'],*o['size'],*o['reference_pixel'],o['reference_confidence'],o['status']])
    labels=[]
    for o in objects:
        x,y=o['reference_pixel']; label=html.escape(o['id'])
        labels.append(f'<g class="pin" data-id="{label}"><circle cx="{x}" cy="{y}" r="9"/><text x="{x+12}" y="{y-7}">{label}</text><title>{label}: {html.escape(o["kind"])}</title></g>')
    refsvg=f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1476 1287"><style>text{{font:14px sans-serif;fill:white;paint-order:stroke;stroke:#101b20;stroke-width:4px}}circle{{fill:#efc179;stroke:#162027;stroke-width:2px}}.pin:hover circle{{fill:#fff}}</style><image href="spec/reference/varendor_world_reference.png" width="1476" height="1287"/>{''.join(labels)}</svg>'''
    (DOC/'REFERENCE_ANNOTATED.svg').write_text(refsvg,encoding='utf-8')
    def point(x,z):return f'{x+800:.1f},{z+700:.1f}'
    def polygon(points):return ' '.join(point(x,z) for x,z in points)
    shapes=[]
    colors=['#626858','#737069','#284b3b','#b6cbd1','#655e4d','#35657a','#776a52','#6c626c','#6b463a','#68624b','#3b5248','#57555b']
    for i,loc in enumerate(locations):
        poly=loc['outline_xz'];cx=sum(p[0] for p in poly)/len(poly);cz=sum(p[1] for p in poly)/len(poly)
        shapes.append(f'<polygon points="{polygon(poly)}" fill="{colors[i]}" stroke="#adbaa3" stroke-width="2"/><text x="{cx+800}" y="{cz+700}">{loc["id"]} · {html.escape(loc["name_ru"])} · {loc["total"]}</text>')
    shapes.append(f'<polygon points="{polygon(layout["water"]["lake"]["polygon"])}" fill="#3691a7" stroke="#85c4cb" stroke-width="3"/>')
    for road in roads:
        points=' '.join(point(x,z) for x,y,z in road['points_xyz'])
        shapes.append(f'<polyline points="{points}" fill="none" stroke="#eac892" stroke-width="{road["width"]+2}" stroke-linejoin="round"/>')
    for o in objects:
        x,y,z=o['position'];shapes.append(f'<circle cx="{x+800}" cy="{z+700}" r="5" fill="#ffe8b0"><title>{o["id"]}</title></circle>')
    worldsvg=f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1400"><style>text{{font:16px sans-serif;fill:white;paint-order:stroke;stroke:#172025;stroke-width:4px}}</style><rect width="1600" height="1400" fill="#14252a"/>{"".join(shapes)}</svg>'
    (DOC/'LAYOUT_PLAN.svg').write_text(worldsvg,encoding='utf-8')
    (DOC/'REFERENCE_REVIEW.html').write_text('''<!doctype html><html lang="ru"><meta charset="utf-8"><title>Varendor — финальная разметка A</title><style>body{background:#101a20;color:#dce4de;font:16px system-ui;margin:28px}h1{font-size:26px}p{max-width:1100px;line-height:1.5}.views{display:grid;grid-template-columns:1fr 1fr;gap:18px}object{width:100%;background:#1d2d34}a{color:#eac892}h2{font-size:18px}</style><h1>Varendor · FINAL 1.0 · разметка A</h1><p>12 локаций · 1600 × 1400 м · 997 обычных + 3 босса. Это разметка предоставленного изображения и пространственная схема, а не готовый мир. Наклонная проекция референса не используется как линейная карта высот.</p><div class="views"><section><h2>Референс: устойчивые ID объектов</h2><object data="REFERENCE_ANNOTATED.svg" type="image/svg+xml"></object></section><section><h2>План сверху: вода, дороги, локации</h2><object data="LAYOUT_PLAN.svg" type="image/svg+xml"></object></section></div><p>Имена сохранены по текущей игре: Астерхолд — посёлок, Гринфолл — крепость. Физические позиции соответствуют финальному референсу. Шахта и пещера имеют собственные внутренние пространства; их население уже входит в 1000.</p><p><a href="LANDMARK_REGISTRY.csv">Реестр ориентиров</a> · <a href="layout-checks.json">Проверки данных</a> · <a href="spec/VARENDOR_WORLD_FINAL_TZ.md">Полное ТЗ</a></p></html>''',encoding='utf-8')
    print(json.dumps({'A_data_valid':True,'objects':len(objects),'roads_to_adjust':[r['id'] for r in grades if r['requires_B_route_adjustment']]},ensure_ascii=False))

if __name__=='__main__':main()
