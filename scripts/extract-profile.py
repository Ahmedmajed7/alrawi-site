#!/usr/bin/env python3
"""Pull the photographs the site uses out of the company profile PDF into public/img/profile/.

Usage: python3 scripts/extract-profile.py [path/to/Al Rawi Profile.pdf]
Needs pypdf and Pillow. Three sets: the four "Smart & Easy Control" cards (page 16, tall), one photo per service
(the profile's own service pages, cropped 3:2) and the photo beside the CEO's message (tall).
"""
import io
import sys
from pathlib import Path

from PIL import Image
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "public/img/profile"
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads/Al Rawi Profile_260202_224531.pdf"
# (page, index of the image on that page, output name, crop box as fractions: left, top, right, bottom, max height)
SHOTS = [
    (16, 0, "control-app", (0.0, 0.0, 1.0, 1.0), 1100),
    (16, 1, "control-panel", (0.2, 0.0, 0.65, 1.0), 1100),
    (16, 2, "control-voice", (0.06, 0.0, 0.81, 1.0), 1100),
    (16, 3, "control-scenes", (0.0, 0.0, 1.0, 1.0), 1100),
    (14, 0, "service-energy", (0.03, 0.0, 0.8885, 1.0), 720),
    (2, 0, "service-automation", (0.18, 0.0, 0.9975, 1.0), 720),
    (6, 0, "service-environment", (0.0, 0.0, 0.837, 1.0), 720),
    (15, 0, "service-security", (0.08, 0.0, 0.9245, 1.0), 720),
    (11, 0, "service-lighting", (0.08, 0.0, 0.92, 1.0), 720),
    (12, 0, "service-entertainment", (0.0, 0.2, 1.0, 0.6445), 720),
    (4, 0, "ceo-room", (0.19, 0.0, 0.723, 1.0), 1300),
]

OUT.mkdir(parents=True, exist_ok=True)
reader = PdfReader(str(PDF))
for page, index, name, (l, t, r, b), max_h in SHOTS:
    img = list(reader.pages[page - 1].images)[index]
    im = Image.open(io.BytesIO(img.data)).convert("RGB")
    w, h = im.size
    im = im.crop((round(l * w), round(t * h), round(r * w), round(b * h)))
    if im.height > max_h:
        im = im.resize((round(im.width * max_h / im.height), max_h), Image.LANCZOS)
    dest = OUT / f"{name}.webp"
    im.save(dest, "WEBP", quality=82, method=6)
    print(f"{dest.relative_to(ROOT)}  {im.width}x{im.height}  {dest.stat().st_size // 1024} KB")
