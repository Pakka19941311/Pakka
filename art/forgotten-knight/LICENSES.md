# Источники и лицензии — Forgotten Knight Art v1

Материалы пакета имеют разные лицензии. CC0 человеческой основы и движений не отменяет атрибуцию, требуемую для доспехов Forgotten Knight.

## The Forgotten Knight — доспехи, плащ, меч и текстуры

**Автор:** Igor Oskolskiy, профиль **dark_igorek**.

- [Оригинальная модель на Sketchfab](https://sketchfab.com/3d-models/the-forgotten-knight-d14eb14d83bd4e7ba7cbe443d76a10fd)
- [Профиль автора](https://sketchfab.com/dark_igorek)
- [Creative Commons Attribution 4.0 International](https://creativecommons.org/licenses/by/4.0/)

Лицензия подтверждена метаданными скачанной модели: `CC Attribution`, URL лицензии `creativecommons.org/licenses/by/4.0/`. При распространении доспехов или производной версии необходимо сохранить авторство, ссылку на источник/лицензию и указать изменения. Нельзя представлять результат как одобренный автором оригинала без такого согласия.

**Изменения для Varendor:** подгонка к телу MakeHuman ростом 1,84 м; разделение геометрии по слотам; перенос привязки к новому скелету; крепление меча к кисти; настройка плаща; цветовые варианты Scarlet, Northwatch и Ashwarden; декоративные розы исключены из экипированного персонажа. Исходные текстуры и UV использованы в адаптированной модели.

Готовая краткая атрибуция для титров/страницы ассетов:

> The Forgotten Knight — Igor Oskolskiy (dark_igorek), CC BY 4.0. Adapted for Varendor: proportions, modular equipment, rigging, cape motion and material variants. Source: https://sketchfab.com/3d-models/the-forgotten-knight-d14eb14d83bd4e7ba7cbe443d76a10fd

## MakeHuman / MPFB2 — тело и человеческий скелет

**Автор:** MakeHuman Community. Основа **hm08**, морфы тела, Mixamo-совместимое описание рига и skin weights — **CC0 1.0 Universal**.

- [Официальный репозиторий MPFB2](https://github.com/makehumancommunity/mpfb2)
- [Лицензионное разделение кода и ассетов на использованной ревизии](https://github.com/makehumancommunity/mpfb2/blob/437dd513888a92399d1d3200d2e80859fae55abc/LICENSE.md)
- [Полный текст лицензии ассетов](https://github.com/makehumancommunity/mpfb2/blob/437dd513888a92399d1d3200d2e80859fae55abc/LICENSE.ASSETS.md)
- [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

Использована ревизия `437dd513888a92399d1d3200d2e80859fae55abc`. Подготовлены мужские пропорции, рост 1,84 м и нормализованные веса, helper-геометрия исключена из игрового тела.

Если вместе с исходными данными сохраняются справочные Python-файлы MPFB, их программный код имеет отдельную лицензию **GPLv3**, указанную в `LICENSE.CODE.md`. Это не меняет указанную автором CC0-лицензию геометрии, морфов и рига. Самостоятельные сценарии Varendor загружают данные, не требуют выполнения справочных модулей MPFB.

## Quaternius — движения

**Автор:** Quaternius; страницы наборов также отмечают вклад аниматора **Gonzalo Furnier**. Использованы бесплатные издания **Standard**, а не платные Pro/Source.

- [Universal Animation Library](https://quaternius.itch.io/universal-animation-library)
- [Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2)
- [CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/)

Оба скачанных архива содержат `License.txt` с CC0 1.0 Universal. Движения выбраны из файлов `UAL1_Standard.glb` и `UAL2_Standard.glb` без `_RM`, перенесены на скелет подготовленного персонажа и сохранены под именами состояний Varendor. Авторский манекен Quaternius не используется как внешний вид героя.

## Учёт источников

`source_provenance.json` содержит исходные ссылки, зафиксированную ревизию MPFB, контрольные суммы скачанных архивов и файлов анимаций. Лицензии оригиналов должны сохраняться при последующем перемещении исходников в другие пакеты.

Paladin и другие ассеты Adobe Mixamo в этой версии не использованы.
