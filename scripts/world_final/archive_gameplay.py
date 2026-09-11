"""Archive only the portable application after exact-binary acceptance."""
from pathlib import Path
import hashlib,json,sys,zipfile
meta=Path(sys.argv[1]);data=json.loads(meta.read_text('utf-8'))
report=json.loads(Path(sys.argv[2]).read_text('utf-8'))
assert report['ok'] is True,'Native gameplay checks failed'
if len(sys.argv)>3:
    castle=json.loads(Path(sys.argv[3]).read_text('utf-8'))
    assert castle['ok'] is True and castle['checks']['return_without_duplicates'],'Castle courtyard acceptance failed'
stage=Path(data['destination']);archive=meta.parent/(data['name']+'.zip')
# The detailed local QA save, bootstrap tokens and raw logs are not deliverables.
with zipfile.ZipFile(archive,'x',zipfile.ZIP_DEFLATED,compresslevel=6) as z:
    for p in sorted(stage.rglob('*')):
        if p.is_file():z.write(p,Path(data['name'])/p.relative_to(stage))
sha=hashlib.file_digest(archive.open('rb'),'sha256').hexdigest()
archive.with_suffix('.zip.sha256').write_text(sha+'  '+archive.name+'\n')
with (meta.parent/'release-notes.md').open('a',encoding='utf-8') as f:
    if len(sys.argv)>3:
        f.write('\nДвор замка: поставляемый EXE отдельно проверен на Windows — вход/выход через ворота, маршруты жителей, торговые и учебные анимации, услуги Эльзы, скрытие в пещере и возвращение без дубликатов.\n')
    f.write('\nПоставляемый EXE и переносимый сервер прошли целевые проверки этапа в Actions на Windows без графического окна. Сценарии: продажа количества, перенос, зелья, автобег R, вход/бой/добыча/выход/повторный вход. Графический тест боя использует уменьшение остатка HP только в изолированной тестовой базе после первого настоящего попадания; это проверка функций, не окончательная оценка сложности босса.\n')
print(json.dumps({'zip':str(archive),'sha256':sha,'bytes':archive.stat().st_size}))
