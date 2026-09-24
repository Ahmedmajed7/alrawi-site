# The house model — what to send and how it is used

The landing page opens on the villa exterior; a tap takes the camera through the entrance and stops at six mounted devices. All of this runs on **one 3D model of the house** supplied by the client.

## Export checklist (send this to whoever makes the model)
- **Format:** glTF 2.0 binary (`.glb`), textures embedded. From Blender: File → Export → glTF 2.0, Format *glb*, tick *Apply Modifiers*, *+Y up*, Materials *Export*, Compression on.
- **Units:** metres. **Axis:** +Y up, −Z forward. Origin on the floor at the front-door threshold.
- **Content:** exterior facade + furnished interior with at least an entrance/hallway, a living room with a window, a ceiling. Doors as separate objects; the entrance door named `door_main` with its pivot on the hinge.
- **Textures:** PBR metallic/roughness, ≤ 2048 px, power of two. Baked lightmaps welcome: name them `<meshname>_lm` on UV channel 2.
- **Budget:** ≤ 300k triangles before optimisation; no lights or cameras baked in.
- **Optional but ideal:** empty objects named `anchor_lock`, `anchor_panel`, `anchor_switch`, `anchor_curtain`, `anchor_speaker`, `anchor_sensor` placed on the surface where each device mounts (local +Z pointing away from the wall), plus `cam_exterior` for the opening shot.

If only `.blend` or `.fbx` is available: export from Blender as above (FBX also needs the textures folder). Blender is not installed on this machine; install it (`brew install --cask blender`) or ask the modeller to export.

## Pipeline
1. Drop the file in `assets/house/` (git-ignored).
2. `node scripts/build-house.mjs assets/house/<file>.glb` → `public/models/house.glb` (≤ 12 MB) and `house-lite.glb` (≤ 5 MB, used on phones).
3. Point `src/data/house.json` → `"model": "/models/house.glb"`, `"modelLite": "/models/house-lite.glb"`.
4. Open `http://localhost:4321/en/?author`:
   - fly with the mouse (orbit) and `W A S D Q E`;
   - press `1`–`6` to select a stop, `P` to log the camera pose, click a wall/ceiling to place the selected stop's device on that surface, `V` to add a waypoint to the current stop, `X` to set the exterior pose, `J` to copy the whole `house.json` to the clipboard;
   - paste over `src/data/house.json`.
5. `node scripts/shoot-stops.mjs` renders the exterior and all six stops for the poster, OG image and the low-end slideshow.

Named `anchor_*` / `cam_exterior` nodes inside the model take precedence over `house.json` positions.
