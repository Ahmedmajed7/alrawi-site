# Al Rawi Smart Home — website

Bilingual (AR/EN) static site for Al Rawi Smart Home with a 3D intro and interactive 3D product viewer. Built with Astro + Three.js. No backend.

## Run
```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # → dist/
npm run preview
```

## Edit content
- Products / categories / services / contact details: `src/data/*.json` (every text has `ar` and `en`).
- UI wording: `src/i18n/ar.json`, `src/i18n/en.json`.
- Product photos: `public/img/products/<slug>.webp` (+ `-card.webp` 480px) and `public/img/products/<slug>/NN.webp` for galleries.
- Contact form: put a Web3Forms access key in `src/data/site.json` → `formEndpoint`. Without it the form opens the visitor's email app.

## 3D
See `docs/3d-models.md` for dropping in photoreal GLB models. Procedural models are configured per product via `shape` / `shapeParams`.

## Deploy (Cloudflare Pages)
Build command `npm run build`, output directory `dist`. Custom headers live in `public/_headers`. Point `alrawioman.com` at the Pages project; `www` → apex redirect via a Cloudflare bulk redirect rule.
