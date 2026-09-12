# Шесть подвижных ног Roach

Подготовка из сохранённого V3RoachCandidate.glb без private Blender файла. SHA исходной четырёхногой основы проверяется самим скриптом. Требуется Blender4.2.3; новый выходной каталог:

```text
blender --background --factory-startup --disable-autoexec --python scripts/assets/roach-six/prepare.py -- --source <repo>/godot-pc/world-expansion-v3/actors/alternatives/roach/V3RoachCandidate.glb --output <new-output>
```

Генератор копирует геометрию и UV передней ноги в две отдельные средние цепи. Их длины заданы по фактическим суставам и контакту, а не искусственным display tails импортированного GLTF. Настоящие root/upper/lower/claw joints получают веса. Новый опорный цикл:55% stance, ход0,3331м, подъём70мм, фазы0,25/0,75. Трёхсуставная IK запечена в шесть исходных клипов; временные IK targets и constraints не экспортируются. В игре работает обычный skinned AnimationPlayer.

Две жвалы сделаны объёмными, плавно изогнутыми, слегка неровными; они взвешены к исходным JawL/JawR. Для их роговой поверхности применяется тёмный материал без новой текстуры. Корпус сохраняет исходные UV, изображения и normalmap; экспорт дополняется стандартным GLTF baseColorFactor. Поза смерти корректируется по фактическому минимуму объединённого skinned mesh.

Выход: V3RoachSixLeg.glb, six-leg.blend и six-leg-adaptation.json. Воспроизведение Blender не считается native или live проверкой. Godot запускается только scripts/godot_run_checked.py.

Арт сохраняет CC BY-SA3.0; full license, authors, изменения и standalone packaging указаны в каталоге actors/alternatives/roach-six. Независимый код не релицензируется.
