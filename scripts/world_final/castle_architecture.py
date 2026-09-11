"""Greenfall revision 02: one castle ensemble and a walk-in public tavern.

Uses the courtyard builder's measured primitives. Authoring coordinates are
server X/Z; all floors meet the accepted castle platform at Y=70.
"""
import math
import bpy


def rebuild(g):
    start, box, cyl, beam, mesh = [g[k] for k in ['start','box','cylinder','beam','mesh']]
    block, barrel, crate, table, sphere = [g[k] for k in ['block','barrel','crate','table','sphere']]
    mat = g['material']
    mat('dressed_limestone',(.43,.40,.34),'castle_wall_slates')
    mat('slate',(.19,.23,.25),'roof_slates_02')
    mat('warm_plaster',(.18,.14,.09))
    mat('recess',(.025,.031,.032))
    mat('flagstone',(.32,.31,.28),'cobblestone_floor_001')
    mat('wax',(.78,.62,.34)); mat('amber_glass',(.51,.22,.055))
    mat('leather_green',(.065,.13,.095)); mat('leather_red',(.22,.045,.035))
    mat('tavern_oak',(.09,.055,.025),'medieval_wood')
    mat('tavern_oak_dark',(.055,.033,.018),'medieval_wood')
    mat('tavern_oak_light',(.13,.075,.031),'medieval_wood')
    mat('aged_rug',(.075,.016,.012))

    # Replace the little canvas fair and isolated paving islands. Preserve the
    # previously authored furniture/roles unless the new floor plan needs space.
    remove={'Elsa_provisions','Caravan_exchange','Mira_herbs','Well_paving','Market_paving',
            'Training_sand','Herb_bed_A','Herb_bed_B'}
    old_gardens=[]
    for name in remove:
        parent=bpy.data.objects.get(name)
        if parent:
            for child in list(parent.children): bpy.data.objects.remove(child,do_unlink=True)
            bpy.data.objects.remove(parent,do_unlink=True)
    g['props'][:]=[p for p in g['props'] if p['id'] not in remove]
    g['obstacles'][:]=[o for o in g['obstacles'] if not any(o['id'].startswith('courtyard:'+n+':') for n in remove)]

    def wall(name,x,z,w,d,h,material='dressed_limestone',low=0,solid=True):
        box(name,(x,z,low+h/2),(w,d,h),material,.045)
        block(x,z,w,d,low+h,low,solid)

    def roof(w,d,eave,rise,axis='x',material='slate'):
        # Closed gable roof with a real overhang, fascia and raised ridge.
        w+=1.0; d+=1.0
        if axis=='x':
            v=[(-w/2,-d/2,eave),(w/2,-d/2,eave),(-w/2,d/2,eave),(w/2,d/2,eave),(-w/2,0,eave+rise),(w/2,0,eave+rise)]
            f=[(0,1,5,4),(2,4,5,3),(0,4,2),(1,3,5)]
            beam('ridge',(-w/2-.2,0,eave+rise),(w/2+.2,0,eave+rise),.13,material)
        else:
            v=[(-w/2,-d/2,eave),(w/2,-d/2,eave),(-w/2,d/2,eave),(w/2,d/2,eave),(0,-d/2,eave+rise),(0,d/2,eave+rise)]
            f=[(0,4,5,2),(1,3,5,4),(0,1,4),(2,5,3)]
            beam('ridge',(0,-d/2-.2,eave+rise),(0,d/2+.2,eave+rise),.13,material)
        mesh('steep_slate_roof',v,f,material)
        for z in [-d/2,d/2]:box('eaves',(0,z,eave-.06),(w,.22,.26),'weathered_oak')
        for x in [-w/2,w/2]:box('eaves',(x,0,eave-.06),(.22,d,.26),'weathered_oak')

    def arch(x,z,base,r,depth=.6,material='dressed_limestone'):
        for i in range(11):
            a=math.pi*i/11; b=math.pi*(i+1)/11
            v=[(x+rr*math.cos(t),zz,base+rr*math.sin(t)) for zz in [z-depth/2,z+depth/2] for rr,t in [(r,a),(r,b),(r+.4,b),(r+.4,a)]]
            mesh('arch_voussoir',v,[(0,1,2,3),(4,7,6,5),(0,4,5,1),(1,5,6,2),(2,6,7,3),(3,7,4,0)],material)

    def window(x,z,y,w=1.25,h=2.4):
        box('deep_window',(x,z,y),(w,.07,h),'recess',0)
        for dx in [-w/2-.12,w/2+.12]:box('window_jamb',(x+dx,z-.06,y),(.22,.30,h+.4),'dressed_limestone')
        for hh in [-h/2-.10,h/2+.10]:box('window_lintel',(x,z-.09,y+hh),(w+.65,.38,.25),'dressed_limestone')
        box('window_mullion',(x,z-.12,y),(.08,.12,h),'iron')
        box('window_transom',(x,z-.12,y+.25),(w,.12,.07),'iron')

    def banner(x,z,top=9,w=1.65,length=4.8):
        beam('banner_bracket',(x-w*.58,z,top),(x+w*.58,z,top),.065,'iron')
        mesh('garrison_banner',[(x-w/2,z-.12,top-.12),(x+w/2,z-.12,top-.12),(x+w/2,z-.22,top-length+.5),(x,z-.30,top-length),(x-w/2,z-.22,top-length+.5)],[(0,1,2,3,4)],'indigo')
        for s in [-1,1]:beam('golden_spear',(x+s*w*.26,z-.32,top-3.6),(x-s*w*.25,z-.32,top-1.0),.038,'brass')
        box('golden_band',(x,z-.34,top-2.2),(w*.78,.025,.11),'brass',0)

    def buttress(x,z,height):
        wall('buttress',x,z,1.25,1.1,height)
        box('buttress_cap',(x,z,height+.1),(1.45,1.35,.25),'dressed_limestone')

    def hall(name,x,z,w,d,h,zone='citadel'):
        start(name,x,z,zone)
        wall('masonry_body',0,0,w,d,h)
        for yy in [.25,3.6,h-.2]:box('stone_string_course',(0,0,yy),(w+.28,d+.28,.35),'dressed_limestone')
        roof(w,d,h,6)
        for dx in [-w/2+.5,w/2-.5]:buttress(dx,-d/2-.35,h*.80)
        n=max(2,int(w/5))
        for i in range(n):
            xx=-w/2+3+(w-6)*i/max(1,n-1)
            for yy in [5.8,h-2.8] if h>12 else [h-2.8]:window(xx,-d/2-.08,yy)
        for dx in [-w*.32,w*.32]:banner(dx,-d/2-.45,h-1.5,1.45,4.6)

    # A continuous paved bailey. Raised foundations stay inside solid buildings;
    # the ground and all principal passages remain the exact original height.
    start('Paved_bailey',-100,-150,'paving')
    box('bailey_cobblestones',(0,0,.131),(155,137,.016),'courtyard_paving',0)
    box('processional_way',(0,-21,.151),(10,91,.018),'flagstone',0)
    box('service_crossway',(0,-41,.174),(129,7,.018),'flagstone',0)
    box('upper_court',(0,15,.195),(73,29,.018),'flagstone',0)
    for x in [-5.3,5.3]:box('avenue_border',(x,-21,.210),(.22,91,.025),'dressed_limestone',0)
    for z in [-44.8,-37.2]:box('crossway_border',(0,z,.210),(129,.20,.025),'dressed_limestone',0)
    # Drain courses, rather than arbitrary dirt discs under each object.
    for x in [-73.6,73.6]:box('side_drain',(x,0,.155),(.32,132,.015),'recess',0)
    for z in [-65.7,65.7]:box('side_drain',(0,z,.155),(147,.32,.015),'recess',0)

    # Dominant keep, flanking wings and taller roofed turrets form one silhouette.
    hall('Citadel_west_hall',-136,-108,35,29,13.4)
    hall('Citadel_east_hall',-66,-105,35,25,12.0)
    hall('Citadel_donjon',-101,-101,31,37,27.0)
    start('Donjon_gate',-101,-119.7,'citadel')
    box('iron_bound_door',(0,0,3.4),(5.2,.26,6.8),'weathered_oak')
    arch(0,-.12,4.35,2.7,.75)
    for x in [-3.1,3.1]:wall('door_jamb',x,-.1,.8,.8,4.4)
    for h in [1.2,3.0,4.8]:box('door_iron_strap',(0,-.18,h),(5.2,.08,.15),'iron')
    banner(-6.0,-.6,18,2.35,8); banner(6.0,-.6,18,2.35,8)
    for side in [-1,1]:
        start('Donjon_turret_'+str(side),-101+side*17,-118,'citadel')
        cyl('octagonal_tower',(0,0,15),3.5,30,'dressed_limestone',n=12)
        block(0,0,7,7,30)
        for y in [1,9.5,18,29.8]:cyl('turret_belt',(0,0,y),3.75,.35,'dressed_limestone',n=12)
        cyl('turret_slate_cap',(0,0,34.1),4.15,8.3,'slate',r2=.10,n=12)
        cyl('finial',(0,0,38.7),.16,1.2,'iron',r2=.03,n=8)
        for h in [7,15,23]:window(0,-3.52,h,.75,2.5)
    # A corbelled parapet and a recessed upper gallery break the flat donjon
    # facade into masonry, shadow and a recognisable fortified crown.
    start('Donjon_machicolations',-101,-120.25,'citadel')
    for x in range(-12,13,2):
        box('stone_corbel',(x,0,25.4),(.62,1.45,1.05),'dressed_limestone')
    box('machicolation_band',(0,-.22,26.10),(30.6,1.7,.6),'dressed_limestone')
    for x in range(-13,14,3):
        box('upper_arrow_slit',(x,-.60,24.5),(.30,.09,1.2),'recess',0)
    # Roofs occupy the inside of the existing battlements. Walls, gate and
    # surrounding landscape are retained in their accepted locations.
    for i,(x,z,r,h) in enumerate([(-183,-76,7.2,24),(-17,-76,7.2,24),(-183,-224,7.2,24),(-17,-224,7.2,24),(-114,-224,6.1,26),(-86,-224,6.1,26)]):
        start('Curtain_tower_roof_'+str(i),x,z,'tower_roofs')
        for j in range(8):
            a=j*math.tau/8;box('roof_support',(math.cos(a)*(r-1.4),math.sin(a)*(r-1.4),h+1.5),(.30,.30,3),'weathered_oak')
        cyl('watchtower_slate_roof',(0,0,h+6),r+1.1,10,'slate',r2=.18,n=8)
        cyl('tower_finial',(0,0,h+11.4),.18,1.3,'iron',r2=.025,n=8)
    start('Gate_heraldry',-100,-221.0,'gate_facade')
    banner(-19,0,17,2.3,7.5);banner(19,0,17,2.3,7.5)

    # Low arcaded gallery against the western curtain; a real 4.8m clear aisle.
    start('West_garrison_gallery',-173,-122,'gallery')
    for z in [-13,-6.5,0,6.5,13]:
        for x in [-2.7,2.7]:
            wall('gallery_pier',x,z,.65,.85,5.4)
            box('pier_cap',(x,z,5.4),(.94,1.10,.28),'dressed_limestone')
    box('gallery_lintel',(0,0,5.5),(6.5,29,.40),'dressed_limestone')
    roof(6.1,29,5.75,3.1,'z')

    hall('Eastern_arsenal',-61,-175,22,18,7.5,'arsenal')
    start('Arsenal_loading_porch',-70,-185.3,'arsenal')
    box('arsenal_door',(0,0,2),(4,.22,4),'weathered_oak')
    for yy in [.9,2.7]:box('door_band',(0,-.14,yy),(4,.08,.13),'iron')
    # Stable has substantial stone end walls and an open service frontage.
    start('West_stable',-165,-155,'stable_building')
    wall('stable_back',-7.5,0,.8,22,6)
    for z in [-11,11]:wall('stable_gable',0,z,15.8,.8,6)
    for z in [-8,-2,4,9]:wall('stable_front_post',7.4,z,.42,.42,5.8,'weathered_oak')
    roof(16,23,6.2,4,'z')
    for dz in [-7,-1,5]:
        wall('stall_divider',-3,dz,9,.20,1.6,'weathered_oak')
        barrel(-5,dz+2);block(-5,dz+2,.9,.9,1)

    def fixed_counter(name,x,z,goods):
        start(name,x,z,'service_arcades')
        # Heavy permanent canopy: slate, stone piers and an oak counter.
        for xx in [-2.35,2.35]:
            wall('shop_pier',xx,1.3,.45,.45,3.4)
        for xx in [-2.35,2.35]:wall('front_post',xx,-1.3,.22,.22,3.2,'weathered_oak')
        roof(5.3,3.5,3.5,1.55)
        table(0,-.30,4.0,1.1)
        for i in range(9):
            xx=-1.5+i*.36
            if goods=='bottle':
                cyl('potion_body',(xx,-.35,1.23),.10,.29,'wine' if i%2 else 'amber_glass',n=10)
                cyl('potion_neck',(xx,-.35,1.42),.047,.10,'amber_glass',n=8)
            else:box('wrapped_bundle',(xx,-.30,1.19),(.28,.66,.24),'linen')
    fixed_counter('Elsa_provisions',-114,-187,'bottle')
    fixed_counter('Mira_herbs',-129,-177,'bottle')
    fixed_counter('Caravan_exchange',-121,-199,'cloth')

    # Training is a bounded working yard, with broad entrances on three sides.
    start('Training_court',-45,-147,'training')
    box('raked_training_earth',(0,0,.18),(27,35,.02),'sand',0)
    for x in [-13.8,13.8]:box('training_border',(x,0,.19),(.25,35.5,.10),'dressed_limestone')
    for z in [-17.7,17.7]:
        for x in [-9,9]:box('training_border',(x,z,.19),(9.4,.25,.10),'dressed_limestone')
    for z in [-12,-5,3,11]:
        wall('training_fence_post',14.3,z,.20,.20,1.15,'weathered_oak')
    for h in [.5,1.0]:box('training_rail',(14.3,-.5,h),(.10,27,.13),'weathered_oak')
    start('Armoury_shelter',-29,-144,'training_shelter')
    for z in [-6,6]:wall('shelter_post',0,z,.4,.4,4,'weathered_oak')
    roof(5,14,4.2,1.8,'z')

    # Herbs belong in the quieter west quarter, away from the inn's door.
    for i,z in enumerate([-135,-140]):
        start('Kitchen_herbs_'+str(i),-162,z,'garden')
        box('soil',(0,0,.10),(4,2.3,.2),'sand')
        for dx in [-2.1,2.1]:wall('bed_edge',dx,0,.15,2.5,.3)
        for dz in [-1.2,1.2]:wall('bed_edge',0,dz,4.3,.15,.3)
        for j in range(16):
            x=-1.6+(j%4)*1.0;zz=-.7+(j//4)*.45
            sphere('sage',(x,zz,.36),(.26,.25,.30),'herb')
        block(0,0,4.3,2.5,.65)

    # The tavern is entered by ordinary walking, no remote teleport. The east
    # opening is 3.6m wide, the floor flush, and the bar leaves a 3m working aisle.
    tx,tz=-155,-199
    start('Tavern_floor',tx,tz,'tavern_floor')
    box('inn_floor_base',(0,0,.16),(25,28,.025),'tavern_oak_dark',0)
    for row in range(54):
        for col in range(8):
            width=24.3/8
            box('oak_floorboard',(-12.15+(col+.5)*width,-13.5+(row+.5)*.5,.195),(width-.018,.484,.065),['tavern_oak','tavern_oak_dark','tavern_oak_light'][(row*7+col*11)%3],.009)
    box('hearth_rug',(-4,4,.243),(6.0,4.6,.015),'aged_rug',0)
    for x in [-6.8,-1.2]:box('rug_border',(x,4,.254),(.07,4.25,.005),'brass',0)
    for side,x,z,w,d in [('west',-12.5,0,.85,28.8),('north',0,14,25.8,.85),('south',0,-14,25.8,.85)]:
        start('Tavern_wall_'+side,tx,tz,'tavern_wall_'+side)
        wall('tavern_masonry',x,z,w,d,4.5)
        wall('tavern_upper_plaster',x,z,w,d,3.6,'warm_plaster',4.5,False)
        for h in [.28,4.6,8.0]:box('tavern_beam',(x,z,h),(w+.12,d+.12,.22),'weathered_oak')
        # Framing belongs to the same cutaway side as its wall.
        if side=='west':
            for zz in [-11,-5,1,7,12]:box('interior_wall_post',(x+.50,zz,4.05),(.24,.24,8.1),'tavern_oak')
            for h in [.75,1.4]:box('oak_dado',(x+.49,0,h),(.12,27.8,.12),'tavern_oak')
        else:
            for xx in [-10,-5,0,5,10]:
                box('interior_wall_post',(xx,z+(.5 if side=='south' else -.5),4.05),(.26,.26,8.1),'tavern_oak')
            for h in [.75,1.4]:box('oak_dado',(0,z+(.5 if side=='south' else -.5),h),(25,.12,.12),'tavern_oak')
    start('Tavern_wall_east',tx,tz,'tavern_wall_east')
    # Split the east wall at z=0, never place one collider across the doorway.
    for z in [-7.95,7.95]:
        wall('east_door_wing',12.5,z,.85,12.3,4.5)
        wall('east_upper_wall',12.5,z,.85,12.3,3.6,'warm_plaster',4.5,False)
    wall('door_lintel',12.5,0,1.05,3.6,4.2,'warm_plaster',3.9,False)
    for z in [-1.95,1.95]:wall('door_jamb',12.5,z,1.15,.35,3.9)
    for z in [-11,-6,6,11]:
        box('upper_timber',(12.98,z,6.25),(.20,.22,3.5),'weathered_oak')
        # Windows face the entrance court and cast warm colour from within.
        box('amber_window',(12.99,z,6.1),(.045,1.45,1.8),'amber_glass',0)
        for yy in [5.2,6.1,7]:box('window_iron',(13.05,z,yy),(.10,1.6,.08),'iron')
        box('window_iron',(13.05,z,6.1),(.10,.08,1.8),'iron')
    for z in [-11,-6,6,11]:
        beam('half_timber_brace',(13.01,z-.7,4.65),(13.01,z+.7,5.15),.07,'tavern_oak')
    # An open timber door is folded along the inner wall, out of the passage.
    box('open_oak_door',(11.83,3.10,1.9),(.20,2.5,3.7),'weathered_oak')
    for h in [.65,2.9]:box('open_door_strap',(11.7,3.1,h),(.08,2.45,.12),'iron')
    start('Tavern_roof',tx,tz,'tavern_roof')
    roof(26.3,29,8.2,7.4,'z')
    for z in [-9,0,9]:
        beam('roof_truss_tie',(-12.3,z,8.1),(12.3,z,8.1),.16)
        beam('roof_truss',(-12.3,z,8.1),(0,z,15),.18)
        beam('roof_truss',(0,z,15),(12.3,z,8.1),.18)
    start('Tavern_entry_porch',tx,tz,'tavern_entry_porch')
    for z in [-2.8,2.8]:
        wall('porch_post',15.4,z,.38,.38,4.4,'tavern_oak')
        box('porch_stone_foot',(15.4,z,.33),(.65,.65,.65),'dressed_limestone')
        beam('porch_brace',(15.4,z,3.4),(14.1,z,4.4),.1,'tavern_oak')
    mesh('slate_porch',[(12.5,-3.35,5.4),(12.5,3.35,5.4),(16.1,3.35,4.35),(16.1,-3.35,4.35)],[(0,1,2,3)],'slate')
    start('Tavern_sign',tx,tz,'tavern_sign')
    beam('sign_bracket',(12.9,-4.6,4.7),(15.1,-4.6,4.7),.09,'iron')
    box('carved_sign',(14.7,-4.6,3.80),(.18,2.1,1.45),'weathered_oak')
    for z in [-5.4,-3.8]:beam('sign_chain',(14.7,z,4.6),(14.7,z,4.3),.027,'iron')
    # A relief bird silhouette instead of a bright floating shop banner.
    sphere('raven_body',(14.82,-4.6,3.8),(.08,.37,.26),'iron')
    sphere('raven_head',(14.84,-4.29,4.03),(.10,.14,.14),'iron')
    mesh('raven_beak',[(14.83,-4.17,4.10),(14.83,-3.98,3.99),(14.83,-4.17,3.94)],[(0,1,2)],'brass')
    for z in [-4.55,-4.72]:beam('raven_legs',(14.84,z,3.63),(14.84,z+.03,3.43),.024,'brass')
    start('Tavern_bar',tx,tz,'tavern_furniture')
    wall('bar_panel',-3,7.3,15,1.35,1.18,'weathered_oak')
    box('bar_top',(-3,7.3,1.24),(15.6,1.65,.16),'weathered_oak')
    for x in [-9,-6,-3,0,3]:
        box('bar_panelling',(x,6.59,.62),(2.5,.10,.80),'wine')
        for dx in [-1.3,1.3]:box('bar_frame',(x+dx,6.52,.62),(.10,.12,1.10),'weathered_oak')
    beam('brass_footrail',(-10.2,6.10,.24),(4.3,6.10,.24),.045,'brass')
    for x in [-10,-7,-4,-1]:
        barrel(x,11.5);block(x,11.5,.90,.90,1)
        barrel(x,11.5,.98)
        box('keg_rack',(x,11.5,.95),(1.05,1.05,.13),'weathered_oak')
        beam('beer_tap',(x,11.0,1.39),(x,10.70,1.39),.045,'brass')
    for yy in [2.5,3.7]:box('back_bar_shelf',(-4,13.4,yy),(16,.65,.16),'weathered_oak')
    for i in range(24):
        x=-11.2+(i%12)*1.25;h=2.76+(i//12)*1.2
        cyl('bottle',(x,13.3,h),.11,.40,'amber_glass' if i%3 else 'leather_green',n=10)
        cyl('bottle_neck',(x,13.3,h+.26),.049,.17,'amber_glass',n=8)

    def mug(x,z,h=1.34):
        cyl('pewter_tankard',(x,z,h),.12,.25,'iron',n=12)
        cyl('ale',(x,z,h+.128),.10,.007,'amber_glass',n=12)
        for hh in [h-.07,h+.07]:beam('tankard_handle',(x+.10,z,hh),(x+.23,z,hh),.020,'iron')
        beam('tankard_handle',(x+.23,z,h-.07),(x+.23,z,h+.07),.02,'iron')
    for x in [-9,-6,-2,2]:mug(x,7.0)
    for x,z in [(-7,-6),(2,-7),(-6,1),(-5,-10),(6,-3)]:
        table(x,z,3.6,1.65)
        for dx,dz in [(-1.0,-.4),(.9,.3)]:mug(x+dx,z+dz,1.21)
        box('bread_board',(x,z,1.11),(.9,.5,.055),'weathered_oak')
        sphere('bread',(x,z,1.25),(.38,.23,.12),'straw')
        for xx,zz in [(x-2.05,z),(x+2.05,z)]:
            cyl('stool',(xx,zz,.52),.37,.14,'weathered_oak')
            for a in range(3):beam('stool_leg',(xx+math.cos(a*math.tau/3)*.23,zz+math.sin(a*math.tau/3)*.23,0),(xx+math.cos(a*math.tau/3)*.22,zz+math.sin(a*math.tau/3)*.22,.49),.05)
            block(xx,zz,.60,.60,.59)
    # This occupied seat is part of the local seated resident's presentation.
    cyl('occupied_stool',(2,-8.7,.55),.39,.15,'tavern_oak')
    for a in range(3):beam('occupied_stool_leg',(2+.25*math.cos(a*math.tau/3),-8.7+.25*math.sin(a*math.tau/3),.14),(2+.24*math.cos(a*math.tau/3),-8.7+.24*math.sin(a*math.tau/3),.49),.05,'tavern_oak')
    # Deep masonry fireplace; lit embers, mantel, iron hood and outside chimney.
    start('Tavern_hearth',tx,tz,'tavern_furniture')
    for z in [-4.8,-1.2]:wall('fireplace_jamb',-11.3,z,1.65,.72,3.2)
    wall('mantel',-11.3,-3,2.05,4.5,.55,'dressed_limestone',3.2,False)
    box('fireback',(-12.01,-3,1.4),(.12,3.0,2.6),'coal')
    block(-11.1,-3,2.2,4.0,3.8)
    for z in [-4.1,-3.2,-2.3]:
        beam('hearth_log',(-11.9,z,.32),(-10.6,z+.3,.32),.15)
        sphere('glowing_ember',(-11.2,z,.45),(.42,.29,.13),'embers')
    start('Tavern_chimney',tx,tz,'tavern_roof')
    wall('chimney_stack',-11.3,-3,2.0,3.8,13,'dressed_limestone',3.6,False)
    box('chimney_crown',(-11.3,-3,16.8),(2.6,4.3,.48),'dressed_limestone')
    # Book alcove is visible from the entrance and clear of the drinking tables.
    start('Tavern_book_alcove',tx,tz,'tavern_furniture')
    for x in [5.8,11.5]:
        box('bookcase_side',(x,11.65,1.7),(.18,1.45,3.4),'weathered_oak')
    box('bookcase_back',(8.65,12.2,1.7),(5.8,.15,3.4),'weathered_oak')
    block(8.65,11.65,5.9,1.5,3.4)
    for h in [.15,1.15,2.15,3.25]:box('bookcase_shelf',(8.65,11.65,h),(5.85,1.5,.16),'weathered_oak')
    for i in range(42):
        x=6.1+(i%14)*.39;h=.56+(i//14)*1.0
        box('bound_tome',(x,11.32,h),(.27,.79,.62+.10*math.sin(i)),['leather_red','leather_green','wine','weathered_oak'][i%4])
        for yy in [-.19,.19]:box('gilt_book_spine',(x,10.915,h+yy),(.27,.017,.027),'brass',0)
    table(8.6,7.6,4.9,1.25)
    for x in [7.2,8.5,10.0]:
        box('display_book',(x,7.45,1.14),(.75,.80,.14),'leather_red' if x<9 else 'leather_green')
        box('book_pages',(x,7.45,1.16),(.66,.72,.10),'parchment')
    # Lit sconces and solid timber beams give the room a readable ceiling scale.
    start('Tavern_lamps',tx,tz,'tavern_lamps')
    lamps=[]
    for x,z,y in [(-5,2,4.7),(4,-6,4.7),(7,9,4.3),(-10,-3,2.2),(13.5,-2.8,3.1)]:
        cyl('lantern_cap',(x,z,y+.37),.26,.13,'iron',r2=.14,n=8)
        cyl('lantern_body',(x,z,y),.20,.60,'amber_glass',n=8)
        cyl('lantern_bottom',(x,z,y-.34),.24,.10,'iron',n=8)
        for a in range(4):beam('lantern_iron',(x+.2*math.cos(a*math.pi/2),z+.2*math.sin(a*math.pi/2),y-.3),(x+.2*math.cos(a*math.pi/2),z+.2*math.sin(a*math.pi/2),y+.3),.022,'iron')
        lamps.append({'x':tx+x,'z':tz+z,'height':y,'range':9 if x<12 else 4})

    # Relocate only residents whose former garden/collection point is occupied.
    wp=g['waypoint']
    for r in g['residents']:
        if r['seed']==114:
            r['route']=[wp(-158,-140,'garden',(-162,-140),12,'pickup',6),wp(-150,-141),wp(-142,-171),wp(-134,-180,'trade',(-129,-177),6,'pickup'),wp(-143,-171),wp(-150,-140)]
            r['x'],r['z']=-158,-140
        if r['seed']==112:
            r['route']=[wp(-77,-186,'collect',(-73,-186),7,'pickup'),wp(-78,-175),wp(-79,-162),wp(-98,-162),wp(-139,-168),wp(-150,-173,'deliver',(-154,-170),6,'pickup'),wp(-138,-175),wp(-99,-172),wp(-78,-177)]
            r['x'],r['z']=-77,-186
    # Local extras reuse the project's rigs; drinking/sway are presentation only.
    add=g['resident']
    add('Трактирщик Бруно','Monk',[wp(-160,-190.3,'tend_bar',(-160,-192),12),wp(-155,-190.3,'tend_bar',(-155,-193),10)],'barkeep',116,civilian=True)
    add('Рудокоп Густав','Monk',[wp(-163,-206.5,'drink',(-160,-205),120)],'drinker',117,civilian=True)
    add('Стражник в отставке','Warrior',[wp(-153,-207.7,'sit_drink',(-153,-206),120)],'drinker',118,civilian=True,phase=2)
    add('Усталый путник','Rogue',[wp(-163,-199.7,'doze',(-161,-198),120)],'sleeper',119,civilian=True)
    add('Весельчак Лутц','Monk',[wp(-154,-202,'drink',(-156,-203),12),wp(-152,-201),wp(-150,-195.5,'drink',(-153,-192),10),wp(-154,-201)],'drinker',120,civilian=True,speed=.75)
    add('Подавальщица Хельга','Ranger',[wp(-148,-196,'serve',(-149,-192),8,'pickup'),wp(-144,-204),wp(-157,-208,'serve',(-161,-205),8,'pickup'),wp(-151,-210),wp(-147,-206)],'server',121,civilian=True)
    g['wildlife'][:]=[{'species':'crow','x':-54,'z':-194},{'species':'crow','x':-56,'z':-202},
                      {'species':'crow','x':-116,'z':-155},{'species':'hare','x':-158,'z':-134},{'species':'hare','x':-169,'z':-139}]
    g['anchors'][:]=[{'text':'ГРИНФОЛЛ','x':-100,'z':-224,'height':8.5,'range':65},
                    {'text':'ЧЁРНЫЙ\nВОРОН','x':-140.07,'z':-203.6,'height':3.8,'range':22,'physical':True,'yaw':math.pi/2}]
    g['tavern']={'name':'Чёрный ворон','bounds':[-167.0,-212.5,-142.8,-185.5],
                 'door':{'x':-142.5,'z':-199},'entry':{'x':-139,'z':-199},'inside':{'x':-147,'z':-199},
                 'bookService':{'id':'npc:books','name':'Книготорговец Северин','model':'Wizard','x':-146.4,'z':-189.9,'role':'Книги умений','yaw':math.pi},
                 'lights':lamps,'replacesLandmarks':['F_KEEP','F_HALL','F_STABLE','F_STORE']}
    g['material_factors']={'weathered_oak':[.14,.085,.044,1],'fieldstone':[.48,.44,.35,1],
        'dressed_limestone':[.55,.51,.44,1],'slate':[.07,.085,.11,1],
        'courtyard_paving':[.30,.275,.23,1],'flagstone':[.40,.37,.31,1],'sand':[.32,.25,.16,1],
        'tavern_oak':[.09,.055,.025,1],'tavern_oak_dark':[.055,.033,.018,1],'tavern_oak_light':[.13,.075,.031,1]}
