#!/usr/bin/env python3
"""Download supplier gallery images listed per product in src/data/products.json → public/img/products/<slug>/NN.webp

`sourceImages` entries may be direct image URLs or WooCommerce product/category pages (their gallery images are scraped).
Confirm image usage rights with the client before publishing.
"""
import json, re, sys, urllib.request
from io import BytesIO
from pathlib import Path
from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
data = json.loads((ROOT / "src/data/products.json").read_text())
UA = {"User-Agent": "Mozilla/5.0 (alrawi-site asset fetcher)"}
IMG_RE = re.compile(r'https://www\.nalitesmart\.com/wp-content/uploads/[^"\s]+?\.(?:jpe?g|png|webp)')

def get(url):
    return urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=30).read()

for p in data:
    urls = []
    for src in p.get("sourceImages", []):
        if re.search(r"\.(jpe?g|png|webp)$", src, re.I):
            urls.append(src)
        else:
            try:
                html = get(src).decode("utf-8", "ignore")
                found = [u for u in IMG_RE.findall(html) if not re.search(r"-\d+x\d+\.", u)]
                urls += list(dict.fromkeys(found))[:8]
            except Exception as e:
                print(f"{p['slug']}: could not read {src}: {e}", file=sys.stderr)
    if not urls:
        continue
    out = ROOT / "public/img/products" / p["slug"]
    out.mkdir(parents=True, exist_ok=True)
    start = len(list(out.glob("*.webp")))
    for i, u in enumerate(urls, start=start + 1):
        try:
            im = Image.open(BytesIO(get(u))).convert("RGB")
            im.thumbnail((1400, 1400), Image.LANCZOS)
            im.save(out / f"{i:02d}.webp", "WEBP", quality=82, method=6)
            print(p["slug"], u.split("/")[-1])
        except Exception as e:
            print(f"{p['slug']}: {u}: {e}", file=sys.stderr)
print("done — add the new files to that product's `gallery` array in products.json")
