#!/usr/bin/env python3
"""Convert scripts/_cache/stops/stop-N.png → public/img/house/stop-N.webp, plus the intro poster and OG image."""
from pathlib import Path
from PIL import Image
ROOT = Path(__file__).resolve().parent.parent
src = ROOT / 'scripts/_cache/stops'; dst = ROOT / 'public/img/villa'; dst.mkdir(parents=True, exist_ok=True)
for f in sorted(src.glob('stop-*.png')):
    im = Image.open(f).convert('RGB'); im.save(dst / (f.stem + '.webp'), 'WEBP', quality=82, method=6); print(f.stem)
ext = Image.open(src / 'stop-0.png').convert('RGB')
ext.save(ROOT / 'public/img/brand/villa-poster.webp', 'WEBP', quality=82, method=6)
og = ext.resize((1200, 675), Image.LANCZOS).crop((0, 22, 1200, 652)); og.save(ROOT / 'public/og.jpg', 'JPEG', quality=86, optimize=True)
print('poster + og written')
