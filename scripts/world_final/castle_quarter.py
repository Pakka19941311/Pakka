"""Revision 03: inhabited streets and a market quarter inside Greenfall's walls.

Coordinates use server X/Z. This layer deliberately retains the operational
tavern and all six established service anchors. Buildings, routes and stalls
are authored together; their physical footprints travel with their meshes.
"""
import math
import bpy


def build(g):
    start, box, cylinder, beam, mesh = [g[k] for k in ('start','box','cylinder','beam','mesh')]
    block, barrel, crate, table, sphere = [g[k] for k in ('block','barrel','crate','table','sphere')]
    mat, wp, add = [g[k] for k in ('material','waypoint','resident')]
    mat('lime_cream',(.20,.153,.09)); mat('lime_ochre',(.17,.105,.042))
    mat('lime_pale',(.15,.155,.125)); mat('lime_russet',(.135,.058,.024))
    mat('frame_oak',(.19,.095,.035),'medieval_wood')
    mat('roof_russet',(.28,.105,.045),'roof_slates_02')
    mat('road_cobbles',(.23,.22,.19),'cobblestone_floor_001')
    mat('yard_cobbles',(.14,.135,.12),'cobblestone_floor_001')
    mat('shop_green',(.035,.067,.028)); mat('shop_ochre',(.15,.078,.015))
    mat('aged_canvas',(.16,.125,.072)); mat('terracotta',(.35,.13,.055))
    mat('fair_red',(.10,.026,.019));mat('fair_blue',(.028,.049,.060))
    mat('street_kerb',(.12,.115,.09),'castle_wall_slates')
    mat('dried_herb',(.055,.09,.033))
    g['material_factors'].update({'frame_oak':[.18,.092,.043,1],
        'roof_russet':[.26,.105,.045,1], 'road_cobbles':[.28,.26,.22,1],
        'yard_cobbles':[.20,.195,.17,1], 'street_kerb':[.12,.115,.09,1]})
    buildings=[]; markets=[]; streets=[]

    def remove(names):
        for name in names:
            parent=bpy.data.objects.get(name)
            if parent:
                for child in list(parent.children): bpy.data.objects.remove(child,do_unlink=True)
                bpy.data.objects.remove(parent,do_unlink=True)
        g['props'][:]=[p for p in g['props'] if p['id'] not in names]
        g['obstacles'][:]=[o for o in g['obstacles'] if not any(o['id'].startswith('courtyard:'+n+':') for n in names)]

    def orient(angle, first):
        group=g['group']; x,z=group.location.x,group.location.y
        group.rotation_euler.z=angle
        c,s=math.cos(angle),math.sin(angle)
        for o in g['obstacles'][first:]:
            dx,dz=o['x']-x,o['z']-z
            o['x']=round(x+dx*c-dz*s,4);o['z']=round(z+dx*s+dz*c,4)
            o['rotation']=-angle

    def roof(w,d,eave,rise,material='roof_russet'):
        # The ridge runs north/south, giving a tall timber gable to the street.
        w+=.85; d+=.9
        vertices=[(-w/2,-d/2,eave),(w/2,-d/2,eave),(-w/2,d/2,eave),(w/2,d/2,eave),
                  (0,-d/2,eave+rise),(0,d/2,eave+rise)]
        mesh('pitched_roof',vertices,[(0,4,5,2),(1,3,5,4)],material)
        for x in [-w/2,w/2]:beam('heavy_eave',(x,-d/2,eave),(x,d/2,eave),.10,'frame_oak')
        beam('ridge_cap',(0,-d/2-.2,eave+rise),(0,d/2+.2,eave+rise),.12,material)
        for z in [-d/2,d/2]:
            for x in [-w/2,w/2]:beam('gable_bargeboard',(x,z,eave),(0,z,eave+rise),.13,'frame_oak')

    def window(x,z,y,w=1.0,h=1.65,shutters=True):
        box('recessed_window',(x,z,y),(w,.06,h),'recess',0)
        for dx in [-w/2,w/2]:box('window_frame',(x+dx,z-.07,y),(.09,.18,h+.16),'frame_oak')
        for dy in [-h/2,h/2]:box('window_frame',(x,z-.07,y+dy),(w+.15,.18,.10),'frame_oak')
        box('window_sill',(x,z-.19,y-h/2-.08),(w+.42,.48,.15),'weathered_oak')
        box('window_lead',(x,z-.09,y),(.06,.06,h),'brass')
        box('window_lead',(x,z-.09,y+.1),(w,.06,.06),'brass')
        if shutters:
            for side in [-1,1]:
                box('open_shutter',(x+side*(w*.75+.10),z-.10,y),(w*.42,.14,h),'shop_green')
                for dy in [-h*.33,h*.33]:box('shutter_hinge',(x+side*(w*.75+.10),z-.19,y+dy),(w*.42,.035,.045),'iron')

    def door(x,z):
        box('oak_shop_door',(x,z,1.6),(1.9,.16,3.0),'frame_oak')
        for dx in [-1.04,1.04]:box('door_quoin',(x+dx,z-.10,1.65),(.26,.38,3.3),'dressed_limestone')
        box('door_header',(x,z-.10,3.22),(2.36,.40,.3),'dressed_limestone')
        for yy in [.55,1.65,2.7]:box('forged_door_strap',(x,z-.11,yy),(1.82,.06,.075),'iron')
        cylinder('door_handle',(x+.6,z-.23,1.35),.08,.09,'brass',n=10).rotation_euler.x=math.pi/2

    def hanging_sign(x,z,label,icon='barrel'):
        beam('sign_arm',(x,z,3.9),(x,z-1.6,3.9),.065,'iron')
        box('carved_trade_sign',(x,z-1.15,3.15),(.14,1.15,1.05),'frame_oak')
        if icon=='barrel':
            cylinder('sign_relief',(x+.10,z-1.15,3.16),.29,.08,'brass',n=12).rotation_euler.y=math.pi/2
        elif icon=='bread':sphere('bread_relief',(x+.10,z-1.15,3.16),(.05,.38,.19),'straw')
        else:
            box('sign_relief',(x+.10,z-1.15,3.16),(.05,.60,.57),'brass')

    def house(name,x,z,w,d,h,plaster='lime_cream',angle=0,roofmat='roof_russet',shop=True):
        zone='quarter_west' if x < -100 else ('quarter_south' if z < -185 else 'quarter_east')
        start(name,x,z,zone); first=len(g['obstacles'])
        box('stone_ground_floor',(0,0,1.72),(w,d,3.44),'fieldstone');block(0,0,w,d,h)
        box('plinth',(0,0,.30),(w+.30,d+.30,.32),'dressed_limestone')
        box('jettied_upper_storey',(0,0,(h+3.4)/2),(w+.44,d+.44,h-3.4),plaster)
        for yy in [3.45,h]:box('oak_floor_beam',(0,0,yy),(w+.66,d+.66,.26),'frame_oak')
        levels=[(3.45+h)/2]
        if h>8.5:
            levels=[4.95,7.95];box('upper_floor_beam',(0,0,6.6),(w+.66,d+.66,.21),'frame_oak')
        n=max(2,round(w/2.8));front=-d/2-.28
        for i in range(n+1):
            xx=-w/2+(w/n)*i
            box('front_timber_post',(xx,front,(h+3.4)/2),(.19,.23,h-3.25),'frame_oak')
            box('rear_timber_post',(xx,-front,(h+3.4)/2),(.19,.23,h-3.25),'frame_oak')
            box('jetty_bracket',(xx,front+.17,3.05),(.20,.72,.80),'frame_oak')
        for xx in [-w/2-.28,w/2+.28]:
            for zz in [-d/2,0,d/2]:box('side_timber_post',(xx,zz,(h+3.4)/2),(.23,.19,h-3.25),'frame_oak')
        for yy in levels:
            for i in range(n):
                xx=-w/2+(w/n)*(i+.5)
                window(xx,front-.04,yy,w=min(1.15,w/n*.40),h=1.45)
                if i in [0,n-1]:beam('diagonal_brace',(xx-w/n*.45,front-.02,yy-.95),(xx+w/n*.43,front-.02,yy-.10),.06,'frame_oak')
        rise=w*.54
        for zz in [-d/2-.23,d/2+.23]:
            mesh('plastered_gable',[(-w/2-.22,zz,h),(w/2+.22,zz,h),(0,zz,h+rise)],[(0,1,2)],plaster)
            beam('gable_kingpost',(0,zz,h),(0,zz,h+rise-.2),.11,'frame_oak')
            beam('gable_tie',(-w*.34,zz,h+rise*.33),(w*.34,zz,h+rise*.33),.08,'frame_oak')
            for side in [-1,1]:beam('gable_brace',(side*w*.40,zz,h+.25),(0,zz,h+rise*.66),.085,'frame_oak')
        window(0,-d/2-.31,h+rise*.38,.80,1.13,False)
        roof(w,d,h+.08,rise,roofmat)
        # Chunky roof chimney, projecting brick courses and two clay pots.
        cx,cz=w*.29,d*.26
        box('chimney',(cx,cz,h+rise*.51),(1.2,1.2,rise+2.1),'fieldstone')
        cy=h+rise+1.55
        box('chimney_cap',(cx,cz,cy),(1.5,1.5,.23),'dressed_limestone')
        for dx in [-.29,.29]:cylinder('clay_flue',(cx+dx,cz,cy+.50),.23,.95,'terracotta',n=10)
        # Ground-level doors, glazed shop windows and a purposeful porch.
        door(-w*.26,-d/2-.08)
        window(w*.23,-d/2-.12,1.95,2.0,1.55,False)
        if shop:
            xx=w*.15; zz=-d/2-1.15; aw=w*.70
            mesh('shop_sunshade',[(xx-aw/2,-d/2-.2,3.45),(xx+aw/2,-d/2-.2,3.45),
                 (xx+aw/2,zz-1.1,2.75),(xx-aw/2,zz-1.1,2.75)],[(0,1,2,3)],'aged_canvas')
            for dx in [-aw/2,aw/2]:
                beam('awning_post',(xx+dx,zz-1.1,.14),(xx+dx,zz-1.1,2.75),.065,'frame_oak')
                block(xx+dx,zz-1.1,.15,.15,2.8)
            hanging_sign(-w/2+.6,-d/2-.3,name)
        orient(angle,first)
        buildings.append({'id':name,'x':x,'z':z,'width':w,'depth':d,'angle':angle,'height':h+rise})

    remove({'Paved_bailey','Barracks_bench'})
    start('Quarter_ground',-100,-150,'paving')
    box('quiet_courtyard_paving',(0,0,.131),(155,137,.016),'yard_cobbles',0)

    def street(name,points,width):
        start(name,-100,-150,'streets')
        for a,b in zip(points,points[1:]):
            dx,dz=b[0]-a[0],b[1]-a[1];length=math.hypot(dx,dz);nx,nz=-dz/length,dx/length
            verts=[(p[0]+100+side*nx*width/2,p[1]+150+side*nz*width/2,.151) for p in (a,b) for side in [-1,1]]
            mesh('laid_cobbled_street',verts,[(0,2,3,1)],'road_cobbles')
            # Small coursed kerbstones, flush enough for free crossing.
            steps=max(1,int(length/1.2))
            for side in [-1,1]:
                for i in range(steps):
                    x=a[0]+dx*(i+.5)/steps+nx*(width/2+.12)*side
                    z=a[1]+dz*(i+.5)/steps+nz*(width/2+.12)*side
                    stone=box('street_edge',(x+100,z+150,.166),(length/steps-.035,.19,.07),'street_kerb',.012)
                    stone.rotation_euler.z=math.atan2(dz,dx)
        streets.append({'name':name,'points':[{'x':x,'z':z} for x,z in points],'width':width})

    street('Королевская улица',[(-100,-216),(-100,-126)],10)
    street('Торговый ряд',[(-138,-199),(-125,-195),(-100,-196),(-88,-196),(-73,-196),(-58,-194),(-30,-190)],6)
    street('Тавернный переулок',[(-137,-210),(-137,-198),(-134,-194),(-133.5,-184.5),(-140.5,-177),(-140.5,-136),(-139,-126)],3.8)
    street('Оружейная улица',[(-90,-213),(-90,-191),(-90,-169),(-90,-150),(-90,-126)],4.2)
    street('Колодезный проезд',[(-156,-141),(-140.5,-141),(-140.5,-130),(-126,-130),(-114,-139),(-100,-149),(-67,-150)],4.2)
    street('Кузнечный проезд',[(-138,-195),(-133,-184),(-119,-182),(-100,-182)],4.5)
    street('Ремесленный проезд',[(-74,-191),(-76,-173),(-74,-169),(-72.75,-165.4),(-71,-160),(-69,-151),(-61,-129),(-39,-126)],3.0)

    # Seat the rest bench against the guild quarter, clear of the diagonal lane.
    bench=bpy.data.objects['Rest_bench'];bench.location.x-=13;bench.location.y+=3
    for p in g['props']:
        if p['id']=='Rest_bench':p.update(x=-121,z=-142)
    for o in g['obstacles']:
        if o['id'].startswith('courtyard:Rest_bench:'):o['x']-=13;o['z']+=3

    house('House_of_herbs',-130,-164,12,12,7.0,'lime_pale',shop=False)
    house('Merchant_guild',-132,-141,12,14,9.8,'lime_ochre',shop=False)
    house('Carpenter_home',-148,-151,10,14,6.8,'lime_cream',shop=False)
    house('Bakers_home',-147,-131,10,9.8,7.0,'lime_russet',shop=False)
    house('Guildhall_east',-80,-138,13,17,9.8,'lime_cream',shop=False,roofmat='slate')
    house('Clothiers_house',-80,-160,13,12,7.1,'lime_ochre',shop=False)
    house('Gate_exchange_house',-79,-211,14,11,7.2,'lime_pale',angle=math.pi,shop=False)
    house('Podkova_alehouse',-60,-209,14,12,6.6,'lime_cream',angle=math.pi,shop=False)
    house('Leatherworkers_house',-35,-202,15,13,7.4,'lime_russet',angle=-math.pi/2,shop=False)
    house('Coopers_house',-32,-177,10,13,6.6,'lime_ochre',angle=-math.pi/2,shop=False)
    house('Garrison_archive',-33,-111,13,17,9.4,'lime_pale',shop=False,roofmat='slate')

    # The keep's stone frontage gains vertical rhythm and an attached chapel.
    start('Keep_front_arcade',-101,-120.25,'citadel_detail')
    for xx in [-12,-8,8,12]:
        box('engaged_masonry_pier',(xx,0,10.7),(.65,1.0,20.5),'fieldstone')
        for yy in [4,12.4,20.8]:box('pier_cap',(xx,-.08,yy),(1.0,1.1,.35),'dressed_limestone')
    for side in [-1,1]:
        for i in range(5):
            x=side*(7+i*1.45)
            box('arcade_recess',(x,-.12,18.2),(.8,.12,2.4),'recess')
    start('Citadel_chapel',-47,-108,'citadel_detail')
    box('chapel_nave',(0,0,7.6),(8,19,15.2),'fieldstone');block(0,0,8,19,15.2)
    roof(8,19,15.3,5,'slate')
    for x in [-2.5,2.5]:window(x,-9.58,9.5,.85,5.2,False)
    start('Chapel_bell_tower',-47,-99,'citadel_detail')
    box('bell_tower',(0,0,11.5),(6.2,6.2,23),'fieldstone');block(0,0,6.2,6.2,23)
    for x in [-1.9,1.9]:window(x,-3.14,20.0,1.2,3.8,False)
    cylinder('chapel_spire',(0,0,28),5.0,10,'slate',r2=.06,n=8)
    beam('weather_vane',(0,0,32.8),(0,0,35.0),.07,'brass')
    beam('weather_vane_arm',(-.65,0,34.6),(.65,0,34.6),.05,'brass')

    def stall(name,x,z,cloth,goods,seed):
        start(name,x,z,'fair_west' if x < -100 else 'fair_east')
        w,d=4.8,3.4
        for xx in [-w/2,w/2]:
            for zz in [-d/2,d/2]:
                beam('fair_post',(xx,zz,.14),(xx,zz,3.45),.075,'frame_oak');block(xx,zz,.18,.18,3.45)
        for i in range(8):
            a=-w/2+i*w/8;b=a+w/8
            mesh('sagging_canvas',[(a,-d/2,2.9),(b,-d/2,2.9),(b,0,3.55),(a,0,3.55),(b,d/2,3.0),(a,d/2,3.0)],[(0,1,2,3),(3,2,4,5)],cloth if i%4 else 'aged_canvas')
            mesh('canvas_valance',[(a,-d/2,2.9),(b,-d/2,2.9),(b,-d/2,2.68),((a+b)/2,-d/2,2.61),(a,-d/2,2.68)],[(0,1,2,3,4)],cloth)
        block(0,0,w,d,3.56,2.6,False)
        table(0,-.15,4.1,1.2)
        for row in range(2):
            for col in range(8):
                xx=-1.6+col*.45;zz=-.45+row*.49
                if goods=='bread':sphere('fresh_bread',(xx,zz,1.20),(.23,.15,.13),'straw')
                elif goods=='fruit':sphere('apples',(xx,zz,1.18),(.14,.13,.14),'apple' if col%2 else 'herb')
                elif goods=='pots':
                    cylinder('clay_pot',(xx,zz,1.25),.17,.36,'terracotta',r2=.12,n=10)
                    cylinder('pot_rim',(xx,zz,1.45),.14,.05,'terracotta',n=10)
                elif goods=='cloth':
                    box('folded_cloth',(xx,zz,1.15+row*.035),(.35,.46,.12),['wine','indigo','aged_canvas'][col%3])
                elif goods=='iron':
                    box('forged_goods',(xx,zz,1.16),(.29,.32,.17),'iron')
                else:cylinder('wax_candle',(xx,zz,1.30),.07,.47,'wax',n=8)
        # Stock at the back, leaving the two open ends and customer frontage.
        crate(-1.55,1.15);barrel(1.55,1.05)
        block(-1.55,1.15,.84,.80,.80);block(1.55,1.05,.9,.9,1.0)
        markets.append({'id':name,'x':x,'z':z,'goods':goods,'vendor':seed,'approach':{'x':x,'z':z-2.35}})

    stall('Bread_fair',-120,-210,'shop_ochre','bread',122)
    stall('Harvest_fair',-130,-210,'shop_green','fruit',123)
    stall('Potters_fair',-128,-188,'fair_red','pots',124)
    stall('Cloth_fair',-81,-199.6,'fair_blue','cloth',125)
    stall('Iron_fair',-47,-188,'shop_ochre','iron',126)
    stall('Candlemakers_fair',-45,-173,'fair_red','wax',127)

    # Open beer garden belonging to the second inn. Its approach is street-side;
    # the first tavern retains the fully accessible interior and book merchant.
    start('Podkova_beer_garden',-59,-199,'alehouse_garden')
    table(-3,0,3.3,1.1);table(3,0,3.3,1.1)
    for xx in [-3,3]:
        for zz in [-1,1]:
            box('beer_garden_bench',(xx,zz,.55),(3.3,.38,.16),'frame_oak')
            for dx in [-1.1,1.1]:box('bench_leg',(xx+dx,zz,.31),(.18,.35,.48),'frame_oak')
            block(xx,zz,3.3,.40,.65)
        for dx in [-1,0,1]:cylinder('ale_tankard',(xx+dx,0,1.22),.12,.27,'iron',n=10)
    for xx in [-7,7]:
        beam('garden_shade_post',(xx,1.8,.14),(xx,1.8,4.1),.11,'frame_oak');block(xx,1.8,.24,.24,4.1)
    mesh('beer_garden_awning',[(-7,1.8,4.1),(7,1.8,4.1),(7,-1.6,3.25),(-7,-1.6,3.25)],[(0,1,2,3)],'aged_canvas')
    block(0,0,14,3.6,4.2,3.2,False)

    start('Podkova_carved_sign',-60,-202.80,'alehouse_garden')
    box('sign_board',(0,0,3.8),(4.2,.16,1.15),'frame_oak')
    for h in [3.27,4.33]:box('sign_gilt_frame',(0,.10,h),(4.25,.06,.065),'brass')
    for x in [-2.1,2.1]:box('sign_gilt_frame',(x,.10,3.8),(.065,.06,1.15),'brass')

    # Trade flags frame the entrance to each market, in restrained cloth colours.
    start('Market_bunting',-100,-150,'street_details')
    for a,b in [((-132,-206),(-115,-205)),((-88,-202),(-73,-202)),((-136,-180),(-121,-183))]:
        beam('bunting_rope',(a[0]+100,a[1]+150,5.0),(b[0]+100,b[1]+150,5.0),.015,'straw')
        for x,z in [a,b]:
            beam('bunting_mast',(x+100,z+150,.14),(x+100,z+150,5.4),.08,'frame_oak')
            block(x+100,z+150,.18,.18,5.4)
        for i in range(11):
            t=(i+.5)/11;x=a[0]+(b[0]-a[0])*t;z=a[1]+(b[1]-a[1])*t
            mesh('fair_pennant',[(x+100-.25,z+150,5.0),(x+100+.25,z+150,5.0),(x+100,z+150,4.4)],[(0,1,2)],['fair_red','shop_ochre','fair_blue'][i%3])

    # A sheltered forge and shop fronts make the accepted service NPCs belong
    # to real working places without moving their authoritative anchors.
    start('Brans_forge_roof',-136,-183,'service_frontages')
    for xx,zz in [(-4,0),(4,0),(-4,3),(4,3)]:
        beam('forge_pier',(xx,zz,.14),(xx,zz,4.8),.12,'frame_oak');block(xx,zz,.26,.26,4.8)
    mesh('forge_lean_to',[(-4.5,3.6,5.5),(4.5,3.6,5.5),(4.5,-3.8,4.6),(-4.5,-3.8,4.6)],[(0,1,2,3)],'slate')
    start('Apothecary_shopfront',-130,-171,'service_frontages')
    for x in [-4,4]:
        beam('herb_drying_line',(x,0,3.5),(x,-2.0,3.2),.045,'frame_oak')
        for i in range(6):sphere('drying_herbs',(x,-.2-i*.28,3.1),(.13,.16,.25),'dried_herb')
    hanging_sign(-5,0,'herbs','bread')
    for name,x,z,width in [('Apothecary_nameplate',-130,-170.62,7.6),('Guild_nameplate',-80,-147.05,6.6)]:
        start(name,x,z,'service_frontages')
        box('carved_nameplate',(0,0,3.0),(width,.16,.84),'frame_oak')
        for h in [2.59,3.41]:box('nameplate_border',(0,-.1,h),(width,.04,.045),'brass')

    # Discrete street lanterns and planted tubs line the blocks rather than
    # filling movement corridors with arbitrary crates.
    lights=[]
    for i,(x,z) in enumerate([(-109,-205),(-108,-181),(-108,-160),(-108,-131),(-92,-203),(-92,-174),(-92,-130),(-132.5,-194.2),(-69,-193),(-43,-184)]):
        start('Street_lantern_'+str(i),x,z,'street_details')
        box('lamp_stone_base',(0,0,.36),(.65,.65,.43),'fieldstone');block(0,0,.65,.65,4.1)
        beam('lamp_post',(0,0,.45),(0,0,4.0),.075,'iron')
        beam('curved_bracket',(0,0,4),(0,-.6,4),.06,'iron')
        cylinder('lantern',(0,-.58,3.56),.20,.62,'amber_glass',n=8)
        cylinder('lantern_cap',(0,-.58,3.92),.29,.18,'iron',r2=.1,n=8)
        lights.append({'x':x,'z':z-.58,'height':3.56,'range':5.2})
    for i,(x,z) in enumerate([(-117,-173),(-111,-139),(-123,-126),(-71,-146.5),(-70,-166),(-145,-178)]):
        start('Planted_tub_'+str(i),x,z,'street_details')
        barrel(0,0);block(0,0,.9,.9,1)
        for a in range(7):sphere('rosemary',(math.cos(a)*.23,math.sin(a)*.23,1.15),(.27,.25,.40),'herb')

    # Existing walking tasks are rerouted along the new streets.
    routes={
        112:[wp(-77,-186,'collect',(-73,-186),7,'pickup'),wp(-90,-185),wp(-90,-171),wp(-100,-172),wp(-118,-173),wp(-140,-173),wp(-150,-173,'deliver',(-154,-170),6,'pickup'),wp(-140,-173),wp(-118,-173),wp(-100,-172),wp(-90,-172)],
        114:[wp(-158,-140,'garden',(-162,-140),12,'pickup'),wp(-156,-140),wp(-140.5,-130),wp(-140.5,-153),wp(-140.5,-171),wp(-134,-180,'trade',(-129,-177),6,'pickup'),wp(-141,-171),wp(-140.5,-130),wp(-156,-140)]}
    for r in g['residents']:
        if r['seed'] in routes:
            r['route']=routes[r['seed']];r['x'],r['z']=r['route'][0]['x'],r['route'][0]['z']
    vendor_names=['Пекарь Фальк','Овощница Грета','Гончар Отто','Суконщица Берта','Железник Дитрих','Свечница Ильза']
    for i,m in enumerate(markets):
        x,z=m['x'],m['z']
        add(vendor_names[i],['Monk','Ranger','Monk','Rogue','Warrior','Ranger'][i],
            [wp(x,z+1.12,'trade',(x,z-2.3),28,'pickup',7)],'merchant',m['vendor'],civilian=True,phase=i*.7)
        add(['Покупатель Эгон','Горожанка Альма','Горожанин Клаус','Купчиха Марта','Оруженосец Ян','Паломница Роза'][i],
            ['Rogue','Ranger','Monk','Ranger','Warrior','Wizard'][i],
            [wp(x,z-2.35,'trade',(x,z+1.1),9,'pickup',6),wp(x+3.3,z-2.6,'inspect',(x,z),5)],'buyer',128+i,civilian=True,phase=2+i)
    add('Разносчик Тило','Monk',[wp(-113,-204),wp(-108,-195),wp(-108,-182,'deliver',(-111,-190),5,'pickup'),wp(-111,-202)],'porter',134,civilian=True)
    add('Плотник Конрад','Monk',[wp(-139.8,-150,'work',(-143,-150),16,'pickup'),wp(-140,-143,'inspect',(-144,-143),7)],'worker',135,civilian=True)
    add('Хозяин «Подковы»','Monk',[wp(-59,-201,'tend_bar',(-62,-199),14),wp(-59,-197,'talk',(-62,-199),6)],'barkeep',136,civilian=True)
    add('Караванщик Хью','Warrior',[wp(-65,-199,'drink',(-62,-199),120)],'drinker',137,civilian=True)
    add('Менестрель Фенн','Rogue',[wp(-111,-155,'talk',(-116,-155),15,'pickup'),wp(-113,-160),wp(-110,-152)],'walker',138,civilian=True)
    add('Горожанка Адела','Ranger',[wp(-89,-151),wp(-69,-151),wp(-66,-160,'inspect',(-61,-170),7),wp(-90,-151)],'walker',139,civilian=True)
    g['wildlife'][0].update(x=-51,z=-194);g['wildlife'][1].update(x=-68,z=-204)
    g['quarter']={'revision':3,'buildings':buildings,'markets':markets,'streets':streets,'lights':lights,
       'alehouse':{'name':'Подкова','entry':{'x':-59,'z':-196.8}},
       'routeReview':[{'x':-100,'z':-205},{'x':-113,'z':-202},{'x':-139,'z':-199},
          {'x':-140.5,'z':-153},{'x':-114,'z':-140},{'x':-100,'z':-128},
          {'x':-90,'z':-151},{'x':-69,'z':-151},{'x':-76,'z':-193},{'x':-59,'z':-196.8}]}
    # Signs face the street. No floating district titles above every roof.
    g['anchors'].extend([
       {'text':'ПОДКОВА','x':-60,'z':-202.68,'height':3.8,'range':26,'physical':True,'yaw':math.pi,'font_size':44,'pixel_size':.010},
       {'text':'АПТЕКАРСКАЯ ЛАВКА','x':-130,'z':-170.73,'height':3.0,'range':30,'physical':True,'yaw':0.0,'font_size':44,'pixel_size':.007},
       {'text':'ГИЛЬДИЯ КУПЦОВ','x':-80,'z':-147.16,'height':3.0,'range':30,'physical':True,'yaw':0.0,'font_size':44,'pixel_size':.007}])
    print('QUARTER_REV3 '+str({'buildings':len(buildings),'market_stalls':len(markets),'residents':len(g['residents'])}),flush=True)
