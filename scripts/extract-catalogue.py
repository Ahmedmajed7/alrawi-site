#!/usr/bin/env python3
"""Extract text and images from the client catalogue PDF.

Usage: python3 scripts/extract-catalogue.py [path/to/catalogue.pdf]

Outputs (all under scripts/_cache/, git-ignored):
  text.txt                 raw text per page, for authoring src/data/products.json
  pdf-images/pNN-K.png     every embedded image, page-numbered
Product photos are then picked by hand and converted with scripts/make-webp.py.
"""
import sys, os, re
from pathlib import Path
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parent
PDF = Path(sys.argv[1]) if len(sys.argv) > 1 else Path.home() / "Downloads" / "Product Catalogue General.pdf"
OUT = ROOT / "_cache"
IMG = OUT / "pdf-images"
IMG.mkdir(parents=True, exist_ok=True)

reader = PdfReader(str(PDF))
lines = []
for i, page in enumerate(reader.pages, start=1):
    text = page.extract_text() or ""
    lines.append(f"\n===== PAGE {i} =====\n{text}")
    for k, im in enumerate(page.images, start=1):
        try:
            pil = im.image
            w, h = pil.size
            if w * h < 120 * 120:
                continue
            pil.save(IMG / f"p{i:02d}-{k}.png")
        except Exception as e:  # noqa: BLE001
            print(f"page {i} image {k}: {e}", file=sys.stderr)
(OUT / "text.txt").write_text("\n".join(lines), encoding="utf-8")
print(f"wrote {OUT/'text.txt'} and {len(list(IMG.glob('*.png')))} images")
