# Al Rawi Smart Home — website

Client: Al Rawi Smart Home (alrawioman.com), Omani smart-home integrator, offices in Muscat and Riyadh.
Bilingual (Arabic default, English) static marketing + product site with a 3D intro and a 3D viewer per product. No backend.

## Stack
- Astro 7 (static output, `trailingSlash: 'always'`), vanilla CSS with tokens (`src/styles/01-tokens.css`), self-hosted fonts (Cairo, Manrope via @fontsource).
- Three.js for the hero scene (`src/scripts/three/intro-scene.ts`) and product viewer (`src/scripts/three/product-viewer.ts`); procedural models in `src/scripts/three/procedural/index.ts`; GSAP + ScrollTrigger; Lenis (desktop only).
- Deploy: Cloudflare Pages, output `dist/`. Headers in `public/_headers`.

## Commands
- `npm run dev` / `npm run build` / `npm run preview` / `npm run check`
- `npm run extract` — pull text + images from the catalogue PDF into `scripts/_cache/` (git-ignored)
- `python3 scripts/make-webp.py` — convert hand-picked catalogue images into `public/img/`
- `npm run fetch-nalite` — download supplier gallery photos listed in `products.json` `sourceImages`

## Where things live
- Content: `src/data/products.json` (single source of truth, bilingual), `categories.json`, `services.json`, `site.json` (offices, phones, WhatsApp, form key).
- UI strings: `src/i18n/ar.json`, `en.json`; helpers in `src/i18n/utils.ts` (`useT`, `l`, `localePath`, `altLocalePath`).
- Routes: `src/pages/[lang]/...` generated for `ar` and `en`; root `/` redirects by saved choice then browser language.
- 3D: set `"model": true` on a product and drop `public/models/<slug>.glb` (see `docs/3d-models.md`); otherwise `shape` + `shapeParams` pick a procedural recipe (panel, puck, disc, switch, lock, rail, box, orb).

## Conventions
- RTL first: logical CSS properties only; `.icon-dir` mirrors directional icons under `[dir=rtl]`.
- Every text shown to users comes from `i18n/*.json` or the bilingual data files, never hard-coded in components (except the 404 page).
- `[data-reveal]` for scroll reveals; `data-stagger` on the parent staggers children.
- Performance tiers (`perfTier()` in `three/common.ts`): `off` shows photo/poster, `low` disables bloom/shadows, `high` gets everything.

## Glossary
- لوحة التحكم = control panel · حساس = sensor · مفتاح = switch · الستائر = curtains · عرض سعر = quote
