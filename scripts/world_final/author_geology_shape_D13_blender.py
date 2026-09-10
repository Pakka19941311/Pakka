"""Save D13 as a separate native source, retaining the D12 comparison."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('author_geology_shape_D12_blender.py')),init_globals={'GEOGRAPHY_REVISION':'D13'})
