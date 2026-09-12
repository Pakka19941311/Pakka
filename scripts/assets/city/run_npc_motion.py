"""Reproduce one NPC through the project's bounded, hidden Blender launcher."""
import argparse
from pathlib import Path
import subprocess
import sys

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--blender',required=True)
    parser.add_argument('--role',choices=['guard','resident'],required=True)
    parser.add_argument('--reports',required=True,help='Fresh directory for editable Blender master, review and logs')
    parser.add_argument('--output',required=True,help='Destination for the isolated derivative GLB')
    args=parser.parse_args()
    repo=Path(__file__).resolve().parents[3]
    reports=Path(args.reports).resolve();reports.mkdir(parents=True,exist_ok=False)
    author=repo/'scripts/assets/city/prepare_npc_motion.py'
    argv=[str(author),'--','--repo',str(repo),'--role',args.role,'--output',str(Path(args.output).resolve()),'--reports',str(reports)]
    driver=reports/'reproduce.py'
    driver.write_text('import sys,runpy\nsys.argv='+repr(argv)+'\nrunpy.run_path('+repr(str(author))+",run_name='__main__')\n",encoding='utf-8')
    return subprocess.run([sys.executable,str(repo/'scripts/blender_run_checked.py'),'--exe',args.blender,'--script',str(driver),'--output',str(reports/'checked-run'),'--timeout','180'],cwd=repo).returncode

if __name__=='__main__':raise SystemExit(main())
