#!/usr/bin/env python3
"""Convert hand-picked catalogue images (scripts/_cache/pdf-images) into web assets.

Mapping below = which PDF image is which product/category photo. Re-run after
`npm run extract`. Produces public/img/products/<slug>.webp (max 1200px) and
<slug>-card.webp (480px), plus category covers and brand images.
"""
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "scripts/_cache/pdf-images"
PUB = ROOT / "public/img"

PRODUCTS = {  # slug: [main, ...gallery]
    "control-panel": ["p05-2", "p02-5", "p06-3", "p04-3"],
    "audio-panel": ["p07-2"],
    "ceiling-speaker": ["p08-2"],
    "smart-lock": ["p10-2"],
    "smoke-detector": ["p11-2"],
    "gas-sensor": ["p12-2"],
    "siren": ["p13-2"],
    "temp-humidity-sensor": ["p14-2"],
    "motion-sensor": ["p15-2"],
    "presence-sensor": ["p16-2"],
    "door-sensor": ["p17-2"],
    "light-switch": ["p19-3", "p19-1", "p18-3"],
    "dimmer-switch": ["p20-2"],
    "heater-switch": ["p21-2"],
    "scene-switch": ["p22-2"],
    "ir-controller": ["p24-2"],
    "curtain-motor": ["p25-2"],
    "garage-module": ["p26-2"],
}
CATEGORIES = {
    "main-controllers": "p04-3",
    "audio": "p06-3",
    "security": "p09-3",
    "switches": "p18-3",
    "control-devices": "p23-3",
    "services": "p27-1",
}
BRAND = {"logo-wall": "p03-3", "logo-blue": "p28-3", "texture-blue": "p01-2", "lifestyle-1": "p02-5", "lifestyle-2": "p04-3"}


def save(src: str, dest: Path, max_px: int, quality=82, transparent=True):
    im = Image.open(SRC / f"{src}.png")
    if not transparent:
        im = im.convert("RGB")
    im.thumbnail((max_px, max_px), Image.LANCZOS)
    dest.parent.mkdir(parents=True, exist_ok=True)
    im.save(dest, "WEBP", quality=quality, method=6)
    return im.size


for slug, imgs in PRODUCTS.items():
    print(slug, save(imgs[0], PUB / "products" / f"{slug}.webp", 1200),
          save(imgs[0], PUB / "products" / f"{slug}-card.webp", 480))
    for n, g in enumerate(imgs[1:], start=1):
        save(g, PUB / "products" / slug / f"{n:02d}.webp", 1400, transparent=False)
for slug, src in CATEGORIES.items():
    print(slug, save(src, PUB / "categories" / f"{slug}.webp", 1600, transparent=False))
for name, src in BRAND.items():
    print(name, save(src, PUB / "brand" / f"{name}.webp", 1600, transparent=False))
