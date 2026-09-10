"""One-time, authored FINAL 1.0 layout. Never overwrite edited layout data."""
from pathlib import Path
import json
import math

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'godot-pc/world-final'
SPEC = ROOT / 'docs/world-final/spec'

def initialize():
    target = OUT / 'world_layout.json'
    if target.exists():
        raise SystemExit('Layout exists. Edit it directly; initialization never replaces manual work.')
    requirements = json.loads((SPEC / 'WORLD_REQUIREMENTS.json').read_text(encoding='utf-8'))
    outlines = {
        'L01':[[-565,285],[-435,270],[-405,375],[-555,415],[-595,350]],
        'L02':[[-205,70],[-40,55],[15,150],[-10,245],[-180,255],[-230,160]],
        'L03':[[-790,-255],[-620,-290],[-400,-300],[-300,-570],[-100,-580],[-55,-345],[-285,-170],[-245,70],[-305,235],[-510,270],[-770,160]],
        'L04':[[-800,-700],[-310,-700],[-280,-450],[-440,-300],[-670,-235],[-790,-300]],
        'L05':[[-95,-590],[140,-590],[185,-405],[110,-310],[-70,-315]],
        'L06':[[-110,-220],[120,-290],[395,-255],[485,-110],[505,115],[330,200],[105,135],[-110,25]],
        'L07':[[195,-320],[285,-330],[315,-255],[235,-235],[180,-265]],
        'L08':[[475,-215],[790,-220],[800,120],[545,160],[455,30]],
        'L09':[[255,-700],[800,-700],[800,-155],[660,-125],[465,-170],[305,-300]],
        'L10':[[-180,290],[150,265],[270,450],[235,610],[-60,665],[-225,465]],
        'L11':[[-800,230],[-625,310],[-510,410],[-370,455],[-335,700],[-800,700]],
        'L12':[[370,230],[800,175],[800,700],[215,700],[250,515],[330,375]],
    }
    anchors = {a['id']:dict(a) for a in requirements['approximate_design_anchors']}
    # Existing names remain attached to their existing roles/services. FINAL §6
    # explicitly permits correcting the provisional village/fortress name binding.
    names = {'L01':'Астерхолд','L02':'Гринфолл'}
    locations = [{**loc,'name_ru':names.get(loc['id'],loc['name_ru']),'outline_xz':outlines[loc['id']]} for loc in requirements['locations']]
    lake = [[-55,-100],[-20,-145],[40,-163],[75,-194],[80,-225],[140,-251],[205,-251],[249,-267],[294,-242],[340,-212],[379,-164],[417,-127],[433,-70],[420,-15],[386,22],[357,52],[341,84],[311,111],[277,106],[254,75],[237,35],[187,28],[160,-1],[128,-10],[89,-8],[47,-25],[8,-34],[-31,-61]]
    def road(id,kind,width,points):return dict(id=id,kind=kind,width=width,points_xyz=points)
    roads = [
      road('safe-village-fort','protected',5.5,[[-490,35,340],[-410,38,325],[-355,43,275],[-280,50,230],[-215,57,240],[-170,65,253],[-100,70,243],[-100,70,214],[-100,70,150]]),
      road('fort-lake','main',5,[[-100,70,243],[0,62,241],[92,54,196],[186,49,145],[274,48,143],[307,48,144],[341,48,142],[390,48,109],[420,48,40]]),
      road('west-spine','main',4,[[-280,50,230],[-315,58,130],[-370,69,62],[-420,77,-35],[-414,90,-143],[-360,104,-255],[-250,110,-326],[-95,120,-340],[35,125,-420]]),
      road('living-forest-loop','trail',1.5,[[-370,69,62],[-485,60,105],[-600,64,65],[-675,70,-30],[-610,84,-115],[-515,89,-190],[-414,90,-143]]),
      road('rotten-approach','secondary',2.5,[[-250,110,-326],[-255,114,-385],[-200,122,-430],[-170,122,-450]]),
      road('snow-ascent','ascent',3,[[-414,90,-143],[-470,105,-210],[-575,128,-261],[-650,150,-320],[-493,182,-368],[-629,208,-426],[-465,233,-482],[-540,252,-550]]),
      road('mine-cave-link','secondary',3,[[35,125,-420],[95,118,-365],[100,95,-315],[165,66,-300],[210,49,-286],[245,48,-280]]),
      road('dry-cave-approach','secondary',3,[[-100,70,243],[-195,61,120],[-172,55,18],[-125,48,-74],[-110,47,-162],[8,48,-229],[107,48,-276],[185,48,-289],[245,48,-280]]),
      road('lake-sanctuary','main',4,[[420,48,40],[497,53,40],[561,65,-3],[598,79,-76],[620,80,-100]]),
      road('volcano-ascent','ascent',3.5,[[561,65,-3],[650,85,-84],[687,106,-177],[490,145,-239],[680,180,-293],[494,216,-353],[716,251,-408],[668,275,-491],[628,288,-582],[538,289,-620],[463,250,-551],[498,221,-498],[545,216,-490]]),
      road('south-ruins','main',4,[[-100,70,243],[-65,57,310],[5,40,362],[10,30,425]]),
      road('swamp-path','secondary',2,[[-490,35,340],[-553,29,411],[-621,16,448],[-649,15,506],[-575,14,559]]),
      road('necropolis-road','main',4,[[10,30,425],[121,27,412],[221,25,433],[289,25,437],[321,25,438],[351,25,438],[407,27,422],[478,28,368],[510,28,365],[620,31,310],[660,32,280]]),
      road('eastern-grave-approach','secondary',2.5,[[420,48,40],[479,40,151],[513,33,244],[510,28,365]]),
    ]
    river = [[306,40,105],[310,38,146],[337,30,206],[324,27,263],[366,23,310],[350,21,371],[319,18,438],[288,15,501],[340,10,590],[322,5,700]]
    platforms = [
      dict(id='village',x=-490,z=340,y=35,size=[132,102],blend=40),
      dict(id='fortress',x=-100,z=150,y=70,size=[166,148],blend=50),
      dict(id='ancient_tree',x=-170,z=-450,y=122,size=[68,66],blend=35),
      dict(id='mine_entrance',x=35,z=-420,y=125,size=[60,55],blend=24),
      dict(id='great_cave_entrance',x=245,z=-280,y=48,size=[58,44],blend=14),
      dict(id='lakeside_settlement',x=420,z=40,y=48,size=[85,94],blend=22),
      dict(id='eastern_sanctuary',x=620,z=-100,y=80,size=[100,95],blend=30),
      dict(id='snow_boss',x=-540,z=-550,y=252,size=[74,68],blend=24),
      dict(id='volcano_crater',x=545,z=-490,y=216,size=[100,90],blend=32),
      dict(id='southern_ruins',x=10,z=425,y=30,size=[115,94],blend=24),
      dict(id='necropolis_church',x=660,z=280,y=32,size=[65,80],blend=30),
    ]
    objects=[]
    def obj(id,loc,kind,x,y,z,size,px,py,yaw=0,confidence='high',part=None):
        objects.append(dict(id=id,location_id=loc,kind=kind,position=[x,y,z],rotation_y_deg=yaw,size=size,reference_pixel=[px,py],reference_confidence=confidence,status='authored-placement-pending-mesh',parent_landmark=part,manual=True))
    # Roof inventory: distinct visible roofs are recorded separately; uncertain
    # edge sheds are marked medium rather than presented as measured facts.
    for data in [
      ('V01','civic_house',-489,35,334,[14,13,18],304,914,5,'high'),
      ('V02','house',-528,35,315,[10,9,14],234,888,-18,'high'),
      ('V03','house',-525,35,351,[10,7,12],243,926,15,'high'),
      ('V04','house',-447,35,325,[13,8,10],371,895,18,'high'),
      ('V05','shed',-427,35,346,[8,5,9],402,916,20,'medium'),
      ('V06','shed',-498,35,290,[8,5,10],286,857,45,'medium'),
      ('V07','house',-465,35,288,[9,7,11],346,855,-20,'medium'),
      ('V08','shed',-480,35,370,[8,5,7],327,951,5,'medium'),
    ]:
        id,kind,x,y,z,size,px,py,yaw,confidence=data;obj(id,'L01',kind,x,y,z,size,px,py,yaw,confidence)
    obj('V01_TOWER','L01','tower',-489,35,323,[6,18,6],327,875,part='V01')
    obj('FORT','L02','fortress',-100,70,150,[166,24,148],647,739)
    for id,x,z,px,py in [('F_KEEP',-128,118,598,696),('F_HALL',-78,116,691,727),('F_STABLE',-152,153,553,739),('F_STORE',-62,168,696,754)]:
        obj(id,'L02','house',x,70,z,[14,12,22],px,py,part='FORT')
    obj('ANCIENT_TREE','L03','ancient_tree',-170,122,-450,[42,48,40],610,224)
    obj('SNOW_SUMMIT_W','L04','peak',-675,280,-585,[140,75,135],144,100)
    obj('SNOW_SUMMIT_E','L04','peak',-430,272,-613,[110,66,110],291,95)
    obj('SNOW_ARENA','L04','arena',-540,252,-550,[74,1,68],166,150)
    obj('MINE_PORTAL','L05','mine_portal',35,125,-420,[18,16,12],786,255)
    obj('MINE_UPPER','L05','mine_portal',64,155,-490,[10,10,8],820,194,confidence='medium')
    obj('MINE_SCAFFOLD','L05','scaffold',11,125,-434,[24,17,12],749,263)
    obj('CAVE_MOUTH','L07','cave_mouth',245,48,-280,[42,36,32],945,387)
    for id,kind,x,z,size,px,py,yaw in [
      ('SH01','house',409,58,[12,10,12],1054,618,0),
      ('SH02','house',442,68,[10,7,14],1106,619,-18),
      ('SH03','house',467,24,[10,9,12],1142,586,-25),
      ('SH04','house',387,29,[8,7,11],1020,603,0),
      ('SH05','house',468,61,[8,6,9],1160,617,35),
      ('SH_TOWER','tower',433,5,[8,20,8],1095,563,0),
    ]:obj(id,'L06',kind,x,48,z,size,px,py,yaw)
    obj('PIER','L06','pier',372,41.2,25,[9,1.2,42],975,608,90)
    obj('BRIDGE_LAKE','L06','bridge',308,48,144,[66,12,8],929,694)
    obj('BRIDGE_GRAVES','L12','bridge',321,25,438,[64,8,6],935,904,confidence='medium')
    obj('SANCTUARY','L08','sanctuary',620,80,-100,[96,38,88],1300,524)
    obj('VOLCANO_RIM','L09','crater',545,216,-490,[450,78,400],1232,172)
    obj('RUIN_TOWER','L10','ruined_tower',38,30,397,[18,26,16],804,981)
    for id,x,z,px,py in [('R01',-35,439,698,1021),('R02',-23,397,724,980),('R03',63,436,858,1016),('R04',24,466,794,1058)]:obj(id,'L10','ruined_house',x,30,z,[14,8,12],px,py)
    obj('GRAVE_CHURCH','L12','church',660,32,280,[32,55,64],1373,859,180)
    obj('GRAVE_GATE','L12','ruined_gate',590,27,495,[24,18,6],1371,1060,-12)
    obj('GRAVE_STATUE','L12','statue',422,28,498,[8,22,8],1093,1082)
    for id,x,z,px,py in [('C01',472,310,1114,895),('C02',558,272,1248,842),('C03',404,405,1052,961),('C04',590,443,1324,1000),('C05',655,530,1425,1100)]:obj(id,'L12','crypt',x,28,z,[10,10,13],px,py)
    masks=[
      dict(id='living_forest',location_id='L03',kind='forest',polygon=[[-790,-220],[-650,-250],[-470,-285],[-350,-230],[-280,-70],[-300,130],[-400,235],[-660,210],[-785,90]],canopy=[.50,.90]),
      dict(id='rotten_forest',location_id='L03',kind='dead_forest',polygon=[[-425,-325],[-310,-500],[-230,-595],[-70,-565],[-45,-400],[-165,-285],[-300,-250]],canopy=[.45,.75]),
      dict(id='southern_treeline',location_id='L10',kind='forest',polygon=[[-390,440],[-260,300],[-120,310],[110,580],[215,695],[-240,690]],canopy=[.45,.75]),
      dict(id='western_clearing',location_id='L03',kind='clearing',polygon=[[-690,50],[-595,5],[-535,50],[-566,120],[-645,125]],canopy=[0,.2]),
      dict(id='forest_middle_glade',location_id='L03',kind='clearing',polygon=[[-570,-160],[-506,-207],[-454,-175],[-478,-115],[-548,-116]],canopy=[0,.15]),
    ]
    layout=dict(schema=1,revision='final-1.0-layout-01',status='authored-layout-stage-A',coordinates=requirements['coordinates'],constraints=requirements['hard_constraints'],reference=dict(path='docs/world-final/spec/reference/varendor_world_reference.png',sha256=requirements['reference']['sha256'],projection='oblique, landmarks manually interpreted; not a height map'),locations=locations,anchors=list(anchors.values()),roads=roads,water=dict(lake=dict(level=40,polygon=lake),river=dict(centerline_xyz=river,width=19),swamp=dict(level=13,polygon=outlines['L11'])),platforms=platforms,objects=objects,masks=masks,spaces=requirements['spaces'],seed=149762,cell_metres=128,support_grid_metres=2,overview_camera=dict(position=[1030,1150,1370],target=[0,55,-50],fov=42,projection='perspective',status='initial-must-compare-Godot-frame'),decisions=[dict(id='names',reason='Preserve existing canon/service IDs per FINAL §6: southwest settlement Asterhold, central fortress Greenfall; physical reference positions unchanged.'),dict(id='axis',reason='Authoring is Godot X/Y/Z with +Z south. Existing server +z north remains; convert server z = -Godot Z at the existing boundary.'),dict(id='boss-catalog',reason='Existing bosses are big (Forest Lord), mini (massive Werewolf), rift_boss. No approved separate snow boss exists; resolve L04 placement with this catalog without inventing a species. Environment work is independent.',status='population-stage-review'),dict(id='capacity',reason='Supersedes v4 draft totals. Final capacity is 997 ordinary + 3 bosses, including mine 70 and great_cave 110.')])
    OUT.mkdir(parents=True,exist_ok=True)
    target.write_text(json.dumps(layout,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps(dict(layout=str(target),locations=len(locations),objects=len(objects),roads=len(roads),capacity=sum(l['total'] for l in locations)),ensure_ascii=False))

if __name__=='__main__':initialize()
