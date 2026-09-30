# The house model — what it is and how it is built

The landing page opens on the villa exterior; a tap takes the camera through the gate, the front door opens by itself, five devices are visited inside, then the camera walks back out, the door closes and the smart lock is the last stop.

## Source
`assets/house/villa-tripo.glb` (git-ignored, 56 MB): an AI-generated (Tripo) diorama — one mesh, one 1024² baked albedo, 1.8 M triangles, no hierarchy. It has no usable interior (melted furniture), no door node, no ground under the garden and the entrance is two beams hanging at 1.6 m. Everything else on the landing page is built in code at runtime:

- `src/scripts/three/house/environment.ts` — photographed golden-hour sky (Poly Haven `evening_road_01_puresky`, baked by `npm run sky:build`; shown as photographed, with only a warm in-scatter glow around the sun, dithered, mipmapped), the real Hajar range from elevation data (`terrain.ts`, below), desert sand, the lawn and planting beds inside the compound wall, paver apron, instanced grass, and the Al Rawi "R" floating in the sky above the villa (`logo.ts`: `style: "brand"` = the flat matte brand colours of the key visual on every tier, `"glass"` = tinted panes; hidden while the camera is indoors; under `?live3d` it fades and scales in, never when recording). Fog reach, the terrain haze and the sky fill breathe on the hero loop's period.
- `src/scripts/three/house/terrain.ts` + `scripts/build-terrain.mjs` (`npm run terrain:build`) — the real range: AWS Terrain Tiles (Terrarium PNG, Open Data; SRTM / GMTED via Mapzen — credit them) around `house.json` `terrain` { lat, lon, bearing = compass direction of world −Z, exaggerate }, resampled onto a polar grid out to 32 km with earth curvature, the sun's shadows and a horizon occlusion baked per vertex (re-run after `sky:build`: the shadows follow `sun.dir`). Shaded in the background pass with its own long-range camera (renderer.ts, near 20 m / far 60 km): a rock palette by slope and altitude, erosion gullies carved along the fall line, aerial perspective by true distance. `--preview --cands="lat,lon,bearing;…"` draws silhouette panoramas of candidate viewpoints against the hero frame. Current viewpoint: 23.548 N, 58.395 E (Bawshar, Muscat), looking 150°.
- Wind (`house/wind.ts`): one wind for the whole garden (`house.json` `wind.dir`): every plant bends downwind about its own base (a cantilever, computed in world space and converted to each mesh's local space, so rotated instances and multi-node photoscans agree) and the gust pumps the lean back and forth along that axis — never a circle. Palm fronds also pivot at their roots (per-vertex `aFrond` / `aArc` from `vegetation.ts` `datePalm`).
- `src/scripts/three/house/street.ts` — the compound and its street (rewritten 28 Sep 2026): smooth rendered boundary walls with copings and lit pilasters, smoked-oak slatted street gates in dark-bronze frames, contemporary neighbour villas whose windows trace a room behind the glass (sheers, blinds, lamp-lit rooms), worn asphalt with kerbs and interlock paving, contemporary lamp poles. No merlons, towers or minaret.
- `src/scripts/three/house/interior.ts` — the designed ground floor. Every surface gets `roomShade()`: soft darkening where floor, walls and ceiling meet, computed from the room boxes (cheap, on all tiers), plus world-space UVs so walls and cabinetry never stretch. Furniture sits on blurred contact shadows; on the high tier the downlights are real spots (pools on the floor, scallops on the walls, three cast shadows). Indoors the sky IBL is only a weak fill (`envI`). Textures: `node scripts/fetch-interior-textures.mjs`.
- `src/scripts/three/house/vegetation.ts` — procedural date palms (leaf-boot trunks, V-folded pinnae, dry fronds, dates), bougainvillea and clipped bushes, the photoscanned sidr tree (`npm run trees:build`, skipped on the low tier), and the far oasis of palms.
- `house/door.ts` — the pivot front door in smoked straight-grain oak with slim brass inlays (opening capped at 90°, clear of the hall wall and the walnut casing; the lock rides on its leaf), its dark-bronze rebated frame, and the powder-coated garden gate.
- `house/court.ts` — the entrance court between the street wall and the porch, rebuilt in clean geometry (garden wall, gate piers with stone caps and the lanterns on them, the facade fin, planting beds, a video intercom and house-number plate) where `villa.json` cuts the AI shell away (`court-*`, `porch-junk`).
- `house/interior.ts` — the ground floor: hall, living room + majlis, hallway, kitchen, windows, curtains, cove and spot lights, porch soffit and path. Dimensions come from `src/data/villa.json`.
- `house/materials.ts` `applyShellMaterial` — the shell gets a tiled detail normal on a planar-projected `uv1`.

## Pipeline (`scripts/build-villa.mjs`, configured by `src/data/villa.json`)
1. Bake the transform into metres: origin = front-door threshold on the ground, exterior = +Z, interior = −Z, scale 13 m/unit (`transform`).
2. Delete triangles by axis-aligned boxes (`cuts`, plus one box per `windows` entry): plinth, baked interior, the entrance portal, the gate leaf, window panes.
3. `unweld` + `weld`, then per LOD `simplify` (meshopt) → `textureCompress` (webp) → `draco`.
4. Write `public/models/villa-<hash>.glb` and `villa-lite-<hash>.glb` (hashed because `/models/*` is cached immutable). Paste the paths into `src/data/house.json`.

```
npm run villa:build                      # final LODs (~1.3 MB / 0.8 MB)
npm run villa:dev                        # public/models/villa-dev.glb, cuts only, load with ?model=/models/villa-dev.glb
node scripts/build-villa.mjs --probe=y --nocut --x=-1,1 --z=0,2   # centroid histogram along an axis inside a slab
node scripts/build-villa.mjs --probe=plan --y=0.9,1.1 --cell=0.25  # ASCII plan of what exists at that height
```

## Authoring poses
`http://localhost:4321/en/?author` — orbit + `W A S D Q E`; `1`–`6` select a stop, click a surface to place its device, `P` sets the stop camera, `V` adds a waypoint, `X` exterior, `G` approach, `O` exit-out, `N` exit, `J` copies `house.json`.
Recording flags: `?record` (film-quality tier: 4K shadows, 24-sample AO, depth of field; `?nodof` disables the lens).
Dev flags: `?stop=N` (0 exterior, 1–5 inside, 6 lock outside with the door closed, 7 exit), `?cam=x,y,z&look=x,y,z[&inside=1]`, `?clip=y` / `?cx=x` / `?cz=z` cutaways, `?hide=shell,interior,door,gate,env`, `?env=sky,mountains,street,grass,trees,oasis,apron,logo,birds,props,breathe` (skip parts; `mountains` = the terrain), `?clouds=1` (the old painted cloud veils, off by default), `?skyimg=&skyyaw=&sundir=&skyint=&horizon=` (try a sky from `sky:build --preview` without rebuilding), `?tier=low|high|off`, `?ray=…`, `?fov=` (with `?cam=`; the hero lens itself is `house.json` → `exterior.fov`).

## Baked lightmaps (optional)

The shell material accepts a baked lightmap: `house.json` → `shell.lightMap` (a WebP/PNG url) and `shell.lightMapIntensity`. It is read from the glTF's second UV set (`TEXCOORD_1`, three's `uv1`), so the projected plaster detail moves to a third set automatically. Preparing it in Blender: open the villa, add a second UV map named `lightmap`, select all faces and run *UV → Lightmap Pack* (or *Smart UV Project* with a 0.02 margin, no overlaps); in Cycles bake **Diffuse** with *Indirect* and *Direct* ticked and *Color* off (2048² is plenty; add an AO bake to multiply in if you like); save the image as sRGB; export glTF with *Data → UVs* on so both UV maps ship; then `npm run villa:build` (check that `TEXCOORD_1` survives the simplify step) and point `shell.lightMap` at the file. Three r186 selects the UV set with `texture.channel`, not the old `uv2` attribute. The interior is procedural with world-space UVs, so an interior lightmap only makes sense once a room is exported as its own GLB.

## Posters
`SITE=http://localhost:4321 npm run shoot:stops` renders the exterior, the six stops and the exit → `public/img/villa/stop-N.webp`, `public/img/brand/villa-poster.webp`, `public/og.jpg`.
