# Photoreal 3D models (optional drop-in)

Every product ships with a procedural 3D model built in code. To replace one with a photoreal model:

1. Collect 3–6 photos of the exact device from different angles (the supplier galleries on nalitesmart.com work well; confirm usage rights with the client).
2. Generate a mesh with an image-to-3D tool (Meshy, Tripo, Hunyuan3D, Rodin). Export as **GLB** with PBR textures, target ≤ 30k triangles.
3. Optimise and compress:
   ```bash
   npx @gltf-transform/cli optimize in.glb out.glb --compress draco --texture-compress webp --texture-size 1024
   ```
   Keep each file ≤ 1.5 MB. DRACO decoders are already served from `/draco/`.
4. Save as `public/models/<slug>.glb` (slug from `src/data/products.json`).
5. Set `"model": true` on that product and rebuild. If the file fails to load the viewer falls back to the procedural model automatically and logs a warning.

Orientation: +Y up, model centred near the origin, real-world scale is not required (the viewer fits the camera to the bounding box). In the walkthrough the model's −Z extreme is the mounting face (`house.json` `device.scale` sets its largest dimension in metres). Optionally add an empty node named `hotspot` where the film's caption leader should land (the screen centre, the keypad); without it the leader points at the model's origin.
