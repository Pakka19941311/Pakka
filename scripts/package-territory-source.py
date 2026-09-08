"""Editable scene/source companion; kept out of the portable game download."""
from pathlib import Path
import zipfile, os
root=Path.cwd()
files=[root/'world-source/Varendor_PC_World.blend',root/'scripts/territory_art.py',root/'scripts/godot-pc-world.py',root/'scripts/godot-pc-data.mjs',root/'src/world/territory.ts',root/'src/world/territory-layout.ts',root/'src/world/terrain-surface.ts',root/'godot-pc/generated/territory.json']
files+=list((root/'godot-pc/generated/wildlife').glob('*.glb'))
with zipfile.ZipFile(root/'qa-artifacts/pc-build/Varendor_World_Source.zip','w',zipfile.ZIP_DEFLATED,compresslevel=4) as archive:
    for file in files:archive.write(file,file.relative_to(root))
    archive.writestr('BUILD_COMMIT.txt',os.environ.get('GITHUB_SHA','local')+'\n')
    archive.writestr('README_RU.txt','Редактируемый мир: world-source/Varendor_PC_World.blend. Размеры в метрах. Текстуры упакованы. Данные карты, коллизий и размещения: src/world/territory*.ts. Изменения проходов требуют пересборки топологии и смены mapVersion. Модели фауны: godot-pc/generated/wildlife.\n')
