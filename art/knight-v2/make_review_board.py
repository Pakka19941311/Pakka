"""Arrange actual Blender renders into a labelled comparison; no synthetic imagery."""
import argparse
from pathlib import Path
from PIL import Image,ImageDraw,ImageFont
p=argparse.ArgumentParser();p.add_argument('--source',required=True);p.add_argument('--out',required=True);a=p.parse_args()
font='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';board=Image.new('RGB',(1520,606),'#171e27');d=ImageDraw.Draw(board)
d.text((30,18),'VARENDOR / модульный рыцарь',font=ImageFont.truetype(font,28),fill='#e6d3ab')
for i,(name,label) in enumerate([('Starter','Старт без брони'),('Helmet_Open','Шлем 1 — открытый'),('Helmet_Closed','Шлем 2 — закрытый'),('Armored_Open','Снаряжённый персонаж')]):
 im=Image.open(Path(a.source)/(name+'.png')).convert('RGB').resize((380,500),Image.Resampling.LANCZOS);board.paste(im,(380*i,62));box=d.textbbox((0,0),label,font=ImageFont.truetype(font,20));d.text((380*i+(380-(box[2]-box[0]))/2,573),label,font=ImageFont.truetype(font,20),fill='#e6d3ab')
board.save(a.out)
