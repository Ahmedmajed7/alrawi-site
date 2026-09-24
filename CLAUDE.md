# Al Rawi Smart Home — website

Client: Al Rawi Smart Home (alrawioman.com), Omani smart-home integrator, offices in Muscat and Riyadh.
Bilingual (Arabic default, English) static marketing + product site. Landing = tap-through walkthrough of the client's real villa model (exterior → six mounted devices), plus a 3D viewer per product. Design: luxury light cinematic (paper/stone/brass, Cormorant + Amiri + IBM Plex Sans Arabic). No backend.

## Stack
- Astro 7 (static output, `trailingSlash: 'always'`), vanilla CSS with tokens (`src/styles/01-tokens.css`), self-hosted fonts (Cormorant Garamond, Amiri, IBM Plex Sans Arabic via @fontsource).
- Three.js walkthrough in `src/scripts/three/house/` (walkthrough.ts orchestrates; loader/materials/renderer/camera-rig/devices/slideshow/author) driven by `src/data/house.json`; product viewer `src/scripts/three/product-viewer.ts`; procedural device models `src/scripts/three/procedural/index.ts`; GSAP; Lenis (desktop only).
- Deploy: Cloudflare Pages, output `dist/`. Headers in `public/_headers`.

## Commands
- `npm run dev` / `npm run build` / `npm run preview` / `npm run check`
- `npm run extract` — pull text + images from the catalogue PDF into `scripts/_cache/` (git-ignored)
- `python3 scripts/make-webp.py` — convert hand-picked catalogue images into `public/img/`
- `npm run fetch-nalite` — download supplier gallery photos listed in `products.json` `sourceImages`
- `npm run house:build <glb>` — optimise the client's house model into `public/models/house.glb` + `house-lite.glb` (see `docs/house-model.md`; the FBX was converted with `fbx2gltf`, textures are mapped by material name in `house/materials.ts`)
- `npm run shoot:stops` — render exterior + 6 stops + exit with headless Chrome → `public/img/house/`, poster and `og.jpg`
- `node scripts/shoot.mjs out.png URL [w h] [waitMs] [selector] [jsBefore]` — headless screenshot; walkthrough dev flags: `?stop=N`, `?cam=x,y,z&look=x,y,z[&inside=1]`, `?clip=<y>` (cutaway), `?ray=x,y,z,tx,ty,tz;…` (surface probe, logs to console), `?author`, `?tier=low|high|off`, `?slides=1`

## Where things live
- Content: `src/data/products.json` (single source of truth, bilingual), `categories.json`, `services.json`, `site.json` (offices, phones, WhatsApp, form key).
- UI strings: `src/i18n/ar.json`, `en.json`; helpers in `src/i18n/utils.ts` (`useT`, `l`, `localePath`, `altLocalePath`).
- Routes: `src/pages/[lang]/...` generated for `ar` and `en`; root `/` redirects by saved choice then browser language.
- 3D devices: set `"model": true` on a product and drop `public/models/<slug>.glb` (see `docs/3d-models.md`); otherwise `shape` + `shapeParams` pick a procedural recipe (panel, puck, disc, switch, lock, rail, box, orb). The walkthrough mounts the same recipes at real size (`house.json` → `device.scale` in metres, mounting face = recipe −Z).
- Walkthrough stops/camera: `src/data/house.json` (positions in metres, Y-up, front door at x≈−1.35, z 7.70; ground-floor ceiling y 3.29).

## Conventions
- RTL first: logical CSS properties only; `.icon-dir` mirrors directional icons under `[dir=rtl]`.
- Every text shown to users comes from `i18n/*.json` or the bilingual data files, never hard-coded in components (except the 404 page).
- `[data-reveal]` for scroll reveals; `data-stagger` on the parent staggers children.
- Performance tiers (`perfTier()` in `three/common.ts`): `off` shows photo/poster, `low` disables bloom/shadows, `high` gets everything.

## Glossary
- لوحة التحكم = control panel · حساس = sensor · مفتاح = switch · الستائر = curtains · عرض سعر = quote
