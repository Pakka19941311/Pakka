"""Original vector artwork for the twenty authoritative class abilities."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1] / 'godot-pc/assets/icons'
blade = '<path d="M24 40 43 11 53 6 52 19 31 46Z" fill="url(#steel)"/><path d="m18 35 20 14M20 43l-9 12" stroke="#d6b878" stroke-width="5"/>'
arrow = '<path d="m10 53 35-35m-11 0 20-8-8 20-1-12Z" fill="url(#steel)" stroke="#dfdbc6" stroke-width="2"/><path d="m11 43-4 10 10-3m3-16-4 10 10-3" fill="none" stroke="#a99160" stroke-width="3"/>'
shield = '<path d="M12 13 32 7 52 13 49 39Q44 51 32 58 19 49 15 39Z" fill="url(#steel)" stroke="#d9b777" stroke-width="2"/><path d="M22 18 32 14 43 18 40 35 32 44 24 35Z" fill="var(--c)"/><path d="M32 18v24M23 28h18" stroke="#e8e4cc" stroke-width="2"/>'
skull = '<path d="M15 34C5 2 59 2 49 34L43 42V55H21V42Z" fill="url(#steel)" stroke="#b9c2b4"/><path d="m19 26 10 3-3 9-9-3m18-6 10-3 2 9-9 3M29 41l3-5 3 5M27 47v8m9-8v8" fill="#14202a" stroke="#14202a" stroke-width="2"/>'
art = {
 'knight': [
  ('#c08d44', '<path d="m7 13 17 12-5-20 14 16 6-15 3 19 18-4-16 13" fill="#ecb963" opacity=".65"/>'+blade),
  ('#6e99b1', shield+'<path d="m6 8 8 2m43 0 5-5M5 37l8-3m42 6 7 4" stroke="#fff0c2" stroke-width="3"/>'),
  ('#ddb960', '<path d="M6 43Q39 51 56 9 63 56 14 59Z" fill="var(--c)" opacity=".85"/>'+blade),
  ('#aa8750', '<path d="M6 27 3 47 14 58m44-31 3 20-11 11M23 6l9-5 9 5" fill="none" stroke="#f3ca73" stroke-width="3"/>'+shield),
 ],
 'mage': [
  ('#e07831', '<path d="M13 54Q-1 30 30 28L49 4Q50 26 58 29 51 57 13 54Z" fill="#cb512b"/><path d="M17 50Q7 37 31 34L45 17Q43 34 49 36 40 52 17 50Z" fill="#f3b649"/><path d="m15 50 29-21-14 24" fill="#fff0ad"/>'),
  ('#64bcd4', '<path d="m10 54 22-35 19-14 7 8-21 26Z" fill="url(#steel)" stroke="#c6f5fa" stroke-width="2"/><path d="m10 8 11 13m0-13L10 21M39 49h19m-9-9v19" stroke="#7bcedb" stroke-width="2"/>'),
  ('#9a9ae5', '<path d="M40 3 14 30H29L21 60 54 23H38Z" fill="#e3e2ff"/><path d="m24 17-16 4 7 11-10 11m39-8 14 5-8 13" fill="none" stroke="#929ddd" stroke-width="3"/>'),
  ('#7fbfd4', '<ellipse cx="32" cy="43" rx="26" ry="13" fill="none" stroke="#a9e9f1" stroke-width="4"/><path d="M32 4v35M17 13l30 18M47 13 17 31m15-19-6-6m6 6 6-6m-16 14-7 2m28-2 7 2m-23 7v8m10-8v8" fill="none" stroke="#d4eff0" stroke-width="3"/>'),
 ],
 'assassin': [
  ('#8269ac', '<path d="M15 7Q45-2 52 27L35 57 17 48 6 35Z" fill="#3a325a"/>'+blade),
  ('#80aa54', blade+'<path d="M20 13Q5 33 19 33 33 33 20 13ZM45 37Q33 56 46 57 59 56 45 37Z" fill="#96bd59" stroke="#d0dc91"/>'),
  ('#b284be', '<path d="M31 8Q43 9 42 22L38 29 49 39 48 58H12V39L24 29Q17 8 31 8Z" fill="#43364e" stroke="#9685a7"/>'+blade),
  ('#807ba8', '<path d="M32 5Q13 11 9 31L4 56 20 49 32 57 45 49 60 56 54 31Q50 11 32 5Z" fill="#423b61" stroke="#a99bc3" stroke-width="2"/><path d="M18 30 32 16 47 30 38 44H26Z" fill="#131824"/><path d="m22 32 6 1m8 0 6-1" stroke="#dbd4e6" stroke-width="2"/>'),
 ],
 'ranger': [
  ('#b49d5b', '<circle cx="36" cy="28" r="18" fill="none" stroke="#adbd98" stroke-width="2"/><path d="M36 5v10m0 26v11M13 28h10m26 0h10" stroke="#d4d9af" stroke-width="2"/>'+arrow),
  ('#83b05b', arrow+'<path d="M20 7Q5 27 19 28 33 27 20 7Z" fill="#93c65b" stroke="#c0df8a"/>'),
  ('#d6b373', arrow+'<path d="m38 10 8 3 1 8m3 8 9 2-2 10M19 8l8 4-3 8" fill="none" stroke="#f4ce82" stroke-width="3"/>'),
  ('#a5b581', '<g transform="translate(-5 2) scale(.75)">'+arrow+'</g><g transform="translate(14 -7) scale(.75)">'+arrow+'</g><g transform="translate(22 12) scale(.75)">'+arrow+'</g>'),
 ],
 'necro': [
  ('#9bb8b2', '<path d="m12 54 33-42 8-6 2 11-38 42Z" fill="url(#steel)"/><path d="m12 50-6-1-3 5 4 6 6-2m32-43-6-4 1-6 7-1 4 4" fill="#d2d6c2" stroke="#e5e5cc"/>'),
  ('#a36187', '<path d="M20 51C-3 17 20 8 31 24 42 5 63 20 45 42L30 57Z" fill="#aa4f71" stroke="#d28ba0" stroke-width="2"/><path d="M9 7Q57 1 56 29M7 14Q3 43 23 50" fill="none" stroke="#b7c6ae" stroke-width="3"/><path d="m48 26 10 8 4-12" fill="#c0cbb2"/>'),
  ('#9478b4', '<circle cx="32" cy="31" r="22" fill="none" stroke="#a594bd" stroke-width="2"/><path d="m32 7 18 41-40-24h44L14 48Z" fill="none" stroke="#b6a1d1" stroke-width="2"/><path d="m5 56 10-8m44 8-10-8" stroke="#91ae91" stroke-width="3"/>'),
  ('#93a68b', '<path d="M8 57 11 39m45 18-3-18M6 13l7 4m45-4-7 4" stroke="#8eb49f" stroke-width="3"/>'+skull),
 ]
}
for class_id, skills in art.items():
 for index, (color, paths) in enumerate(skills):
  paths=paths.replace('var(--c)',color)
  svg=f'<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><defs><radialGradient id="a"><stop stop-color="{color}" stop-opacity=".42"/><stop offset="1" stop-color="{color}" stop-opacity="0"/></radialGradient><linearGradient id="steel" x2="1" y2="1"><stop stop-color="#f2ecce"/><stop offset=".45" stop-color="#b6c1bb"/><stop offset=".5" stop-color="#f5eccc"/><stop offset="1" stop-color="#51626c"/></linearGradient></defs><circle cx="32" cy="32" r="32" fill="url(#a)"/>{paths}</svg>'
  (ROOT/f'{class_id}_skill_{index}.svg').write_text(svg+'\n')
print('Created 20 original native skill icons')
