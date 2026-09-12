"""Reproduce CC0 male Viking worker and female robed resident from pinned MPFB.
Reuses the reviewed base generator and motion author without modifying them.
"""
from pathlib import Path
import sys,runpy
repo=Path(__file__).resolve().parents[3]
intake=Path('C:/Users/ttonn/Documents/Codex/2026-09-11/varendor-world-gameplay/work/asset-intake-v3')
out=repo/'art/city-production/base';out.mkdir(parents=True,exist_ok=True)
art=repo/'art/city-production';art.mkdir(parents=True,exist_ok=True)
base=repo/'scripts/assets/city/prepare_npc.py';source=base.read_text(encoding='utf-8')
source=source.replace("for role in ['guard','resident']:","for role in ['worker','woman']:").replace("role=='guard'","role=='worker'")
source=source.replace("'gender':1.0","'gender':0.0 if role=='woman' else 1.0")
source=source.replace("'age':.48 if role=='worker' else .68","'age':.48 if role=='worker' else .36")
source=source.replace("'muscle':.68 if role=='worker' else .38","'muscle':.68 if role=='worker' else .24")
source=source.replace("'weight':.48","'weight':.42 if role=='woman' else .48")
source=source.replace("'young_caucasian_male.mhmat'","('middleage_caucasian_female.mhmat' if role=='woman' else 'young_caucasian_male.mhmat')")
source=source.replace("('short02.mhclo','Hair')","(('ponytail01.mhclo' if role=='woman' else 'short02.mhclo'),'Hair')")
source=source.replace("['eyebrow','short02']","['eyebrow','short02','ponytail01']")
source=source.replace(";bpy.ops.render.render(write_still=True)","")
sys.argv=[str(base),'--','--intake',str(intake),'--output',str(out),'--reports',str(art),'--repo',str(repo)]
exec(compile(source,str(base),'exec'),{'__name__':'__production_base__','__file__':str(base)})
