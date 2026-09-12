"""Archive only the portable application after exact-binary acceptance."""
from pathlib import Path
import hashlib,json,sys,zipfile
meta=Path(sys.argv[1]);data=json.loads(meta.read_text('utf-8'))
report=json.loads(Path(sys.argv[2]).read_text('utf-8'))
assert report['ok'] is True,'Native gameplay checks failed'
assert report.get('packaged_binary') is True,'Acceptance must use the exact packaged EXE and server'
if len(sys.argv)>3:
    castle=json.loads(Path(sys.argv[3]).read_text('utf-8'))
    assert castle['ok'] is True and castle['checks']['return_without_duplicates'],'Castle courtyard acceptance failed'
if len(sys.argv)>4:
    quarter=json.loads(Path(sys.argv[4]).read_text('utf-8'))
    required={'door_walk_in','door_walk_out','door_reenter','bookshop_opens','book_bought_once','quarter_walkable','no_resident_duplicates','walls_still_solid','roof_restored','street_lanterns_work'}
    assert quarter['ok'] is True and quarter.get('packaged_binary') is True,'Packaged quarter acceptance failed'
    assert required.issubset(quarter['checks']) and all(v is True for v in quarter['checks'].values()),'Incomplete quarter acceptance'
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
    if len(sys.argv)>4:
        f.write('\nЗамковый квартал: готовый Windows EXE проверен на проход по улицам, вход/выход/повторный вход в таверну, покупку книги, восстановление крыши и погоды, вечерние фонари и отсутствие дубликатов жителей.\n')
    mode='с графическим окном' if report.get('native_render') else 'без графического окна'
    f.write('\nПоставляемый EXE и переносимый сервер прошли целевые проверки на Windows '+mode+'. Проверенный блок: '+report.get('block','stage')+'. Бой с боссом в функциональном сценарии использует уменьшение остатка HP только в изолированной тестовой базе после первого настоящего попадания; это проверка функций, не окончательная оценка сложности босса.\n')
print(json.dumps({'zip':str(archive),'sha256':sha,'bytes':archive.stat().st_size}))
