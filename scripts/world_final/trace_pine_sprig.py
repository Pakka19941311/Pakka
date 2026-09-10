"""Trace mesh UV outline from the existing twig alpha, without editing its image."""
from pathlib import Path
from PIL import Image
import numpy as np,json
ROOT=Path(__file__).resolve().parents[2]
source=ROOT/'public/assets/world/pine_tree_01/pine_tree_01_twig_diff_1k.png'
image=Image.open(source).convert('RGBA');alpha=np.array(image)[:,:,3]>.35*255
w,h=image.size;alpha[int(h*.46):]=False;alpha[:,int(w*.235):]=False
seed=(int(w*.134),int(h*.32));seen=np.zeros(alpha.shape,bool);stack=[seed];points=[]
while stack:
    x,y=stack.pop()
    if not(0<=x<w and 0<=y<h) or seen[y,x] or not alpha[y,x]:continue
    seen[y,x]=True;points.append((x,y))
    stack.extend((x+dx,y+dy) for dx,dy in [(0,1),(1,0),(-1,0),(0,-1),(1,1),(-1,1),(1,-1),(-1,-1)])
if len(points)<4000:raise RuntimeError('Twig seed did not identify the connected needle sprig')
def cross(o,a,b):return (a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0])
ordered=sorted(set(points));lower=[];upper=[]
for p in ordered:
    while len(lower)>=2 and cross(lower[-2],lower[-1],p)<=0:lower.pop()
    lower.append(p)
for p in reversed(ordered):
    while len(upper)>=2 and cross(upper[-2],upper[-1],p)<=0:upper.pop()
    upper.append(p)
hull=lower[:-1]+upper[:-1]
# An outer eight-plane hull preserves all needle pixels with six triangles per
# card. It excludes the unrelated opaque padding without changing the atlas.
x0,y0=np.min(points,axis=0);x1,y1=np.max(points,axis=0)
outline=[(float(x0),float(y0)),(float(x1),float(y0)),(float(x1),float(y1)),(float(x0),float(y1))]
for nx,ny in [(1,1),(-1,-1),(1,-1),(-1,1)]:
    bound=max(nx*x+ny*y for x,y in points)+.5;clipped=[]
    for a,b in zip(outline,outline[1:]+outline[:1]):
        da=nx*a[0]+ny*a[1]-bound;db=nx*b[0]+ny*b[1]-bound
        if da<=0:clipped.append(a)
        if (da<=0)!=(db<=0):
            t=da/(da-db);clipped.append((a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1])))
    outline=clipped
out=ROOT/'godot-pc/world-final/nature/sprig-outline-D03.json'
out.write_text(json.dumps({'source':source.relative_to(ROOT).as_posix(),'method':'connected alpha island, eight outer support planes; mesh UV clipping only','source_size':[w,h],'island_pixels':len(points),'uv_hull':[[x/w,y/h] for x,y in outline],'image_modified':False},indent=2)+'\n',encoding='utf-8',newline='\n')
print(json.dumps({'pixels':len(points),'vertices':len(outline),'outline':outline}),flush=True)
