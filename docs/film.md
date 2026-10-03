# The landing film — how it works and how to make the AI version

The landing page no longer renders 3D in the browser. It plays a **film**: a looping hero shot, then one short clip per device. Tapping anywhere plays the next move, and the film pauses on each device with its card and a pulsing hotspot. The door-lock clip walks back out, closes the door, and ends on the lock. It is plain H.264 `<video>`, so it plays smoothly on an old office PC.

The clips in the repo right now are recorded from our 3D villa at golden hour, in its walled compound on a quiet Omani street with the Hajar mountains behind, seen from the street at the far pavement (the key visual: house in the lower half, the range filling the band behind it). The floating "R" logo was removed from the scene on 28 Sep 2026 at the client's request; since then the goal is a photoreal 3D film in its own right (see "Photoreal overhaul" at the end). The goal is to replace them with photoreal AI-generated clips in exactly that look: a slow cinematic glide, and rich interiors. The site, the device cards and the tap-to-advance logic all stay the same.

## Clip list

| id | what happens | placeholder length |
|---|---|---|
| `hero` | the villa from the street at golden hour, a slow drift; **must loop seamlessly** | 12.6 s |
| `panel` | garden → gate → porch → **the front door opens by itself** → across the threshold, turning right → the control panel on the first wall on the right (the stone-clad pier) | ≈ 5.9 s |
| `switch` | along the pier and through the cased opening → the light switch on the east wall (1.30 m up) | ≈ 2.7 s |
| `curtain` | a pan left round the pier's end into the living room; the drapes part as the lens reaches the west window → the curtain motor | ≈ 3.5 s |
| `speaker` | rise and tilt up to the ceiling speaker | ≈ 1.7 s |
| `sensor` | back round the pier's end, tilting up to the smoke detector | ≈ 3.2 s |
| `app` | down from the detector and round the pier's end, pulling back to a wide, deep-focus view of the living room (west window, sofa, hearth); the phone comes up here | ≈ 2.8 s |
| `app` scene | not a move: the living room from that pose in every state the phone can put it in (121 positions of the west drapes × lights on / off), played by `film/scene.ts` | 242 frames |
| `lock` | **backwards** out of the living room, eyes on the rooms, through the hall and the front door onto the porch; the lens comes to rest, then **the door closes in front of it** (a hinged leaf on its closer, the bolts last) onto the smart lock | ≈ 5.1 s |
| `outro` | back down the path, through the gate and up to the hero's opening frame | ≈ 5.1 s |

Each clip starts where the previous one ends, so the film reads as one continuous camera move. The player dissolves 0.7 s between clips (the incoming clip fades in over the held frame; the held frame never fades, so there is no dip), which hides small mismatches. Every device's caption is a callout anchored beside it with a hairline leader to the `hotspot` in `film.json`; the recorder projects the recipe's child named `hotspot` (the panel's screen centre, the curtain motor body, the lock's keypad), so keep those points where the device visually is.

On an upright screen (a phone held upright, a tablet) the player shows the whole 16:9 frame in a full-width band rather than covering the screen with a cropped quarter of it, and fetches the rung that band needs (`src/scripts/film/stage.ts`; CLAUDE.md "Upright screens"). Clips stay 16:9: nothing about recording or encoding changes for phones.

## Files and commands

```
assets/film/source/<id>.mp4        recorded 3D placeholders (inputs for video-to-video AI)   — npm run film:record
assets/film/keyframes/<id>-start.jpg / -end.jpg   first/last frames (inputs for image and first/last-frame AI)
assets/film/clips/<id>.mp4         ← put the AI clips here (mp4, mov or webm; any length/resolution ≥ 1280 px wide)
assets/film/hotspots.json          optional: {"panel": [0.52, 0.47]} if a device moved in the AI clip (0..1 from top-left)
assets/film/features.json          optional, AI clips only: where each device's live parts sit on its last frame —
                                   {"panel": {"quads": {"screen": [[x,y] TL, TR, BR, BL]}, "points": {}},
                                    "lock": {"quads": {"keypad": […]}}, "switch": {"points": {"led_0": [x,y], …}}}
                                   (recorded clips carry their own; an AI clip without an entry simply has no live layer)
assets/film/trim.json              optional: {"panel": [0.4, 8.2]} to trim a clip (seconds)
npm run film:encode                encodes everything to public/film/ and writes src/data/film.json
```

`film:encode` always prefers `assets/film/clips/<id>.*` over the placeholder. You can therefore replace clips one at a time and the site stays complete.

- To re-record placeholders after changing the 3D scene, start `npm run dev` and run `SITE=http://localhost:4321 npm run film:record -- --size=2560x1440 --blur=6`, optionally with `--only=panel,lock`. `--blur=6` gives the moves a 6-sample 180° shutter (recording takes about 6× longer). Add `--check` to get a motion metric per clip: it flags any frame-to-frame jump > 34 or jerk > 6 (grey 160×90 frame difference) so a camera path that clips a wall or whips is caught before encoding; the door closing and exposure fades also register, so read the contact sheet before blaming the path. Recording at 1440p and letting the encoder scale down to 1080p gives clean supersampled edges.
- Recording (`?record`) switches the renderer to a film-quality tier a live frame could never afford: 4K sun shadows through the villa's own PCSS filter on fixed taps (nothing swims under a moving camera), 32-sample ambient occlusion, a 2× render box-filtered down, and a depth-of-field lens that racks focus onto each device as the camera arrives and opens to deep focus outdoors (`?nodof` turns the lens off; `stage.focusOn()` in `renderer.ts`).
- To see the live 3D instead of the film, open `/en/?live3d`.

## Making the AI clips

**Route A, recommended: video-to-video restyle.** Upload `assets/film/source/<id>.mp4` to a video-to-video tool (a "restyle", "modify video" or "video reference" mode in Runway, Luma, Kling or similar). Paste the **style block** and the shot prompt below, and keep the structure or reference strength high. The tool then keeps our exact camera path, the door timing and where each device sits, and only replaces the look.

**Route B: keyframes, then first/last-frame video.**

1. Restyle `assets/film/keyframes/<id>-start.jpg` and `<id>-end.jpg` with an image model in image-to-image mode, keeping the composition. Use the style block.
2. Generate each clip with the tool's first-frame / last-frame (keyframe) mode and the shot prompt.
3. Reuse the restyled **end** frame of one clip as the **start** frame of the next, so the film stays continuous.

**Specs for every clip:**

- 16:9, 1920×1080 or higher, 24 or 30 fps.
- No audio.
- No text and no logo: "SMART LIVING" and every caption are HTML over the film, never in the clip, and the scene has no logo (the floating "R" was removed on 28 Sep 2026).
- Roughly the lengths in the table; anything from 2 s to 10 s works.
- The device should end up where it is in the placeholder's last frame. If it doesn't, set a hotspot override.

**Rights:** use a tool and plan whose licence allows commercial use of the output.

### Style block (paste into every prompt)

> Photoreal luxury architectural film of a contemporary Omani villa in Muscat at golden hour. Warm low sun from the left, a blue sky with soft clouds glowing peach near the horizon, sand-coloured limestone and white render with long soft shadows. The villa sits in a walled compound: a pale limestone perimeter wall with glowing wall lights on its pilasters, a gated entrance, an attached garage with a walnut roller door, olive trees, date palms and magenta bougainvillea in the planting beds. A paver road with kerbs runs in front; around it, walled Omani compounds with crenellated walls and corner towers, lit villas, a minaret and a golden dome. The rust-brown Hajar mountains rise close behind in warm light. Above the roof floats a giant flat Al Rawi "R": three matte, slightly translucent strokes in navy, sky blue and green, its bottom hidden by the house. Soft cloud shadows drift slowly across the walls and garden. Warm light glows from every window. Interiors: travertine floors, limewash plaster, walnut slats and consoles, brass details, linen sheers breathing in the air, dust in the window light, a thread of frankincense smoke. Cinematic 35 mm anamorphic look, shallow depth of field, subtle film grain, smooth slow gimbal dolly, elegant and calm. No people.

### Negative prompt (if the tool has one)

> people, faces, hands, animals, cars, text, captions, subtitles, watermark, extra logos, warped or melting architecture, extra doors, flickering, jitter, shaky handheld, fast cuts, cartoon, video-game CGI look, oversaturated colours

### Shot prompts

**hero**: a seamless loop of 10–12 s.
> Slow, almost imperceptible push-in from the far pavement across the street toward the villa at golden hour, camera a little above head height: the limestone compound wall with glowing pilaster lights and the gated entrance in front, olive trees and bougainvillea behind it, the garage with its walnut door on the right, date palms either side, the two-storey villa in the lower half of the frame with warm light in its windows, the giant flat brand-colour Al Rawi "R" floating above the roof against the warm sky, the Hajar mountains filling the band behind. Palm fronds sway gently, high thin clouds drift, a small flock of birds crosses the sky far off, the light is warm and still. The last frame matches the first frame exactly (seamless loop).

**panel**: about 8–9 s; the door must open by itself.
> The camera glides from the garden through the open black steel gate along a travertine path lit by small ground lights, up three stone steps toward a tall walnut-slatted front door with a slim black smart lock. The door swings open inward on its own and warm light spills out. Without stopping, the camera continues through the doorway into a calm entrance hall (travertine floor, walnut slat wall with a round brass mirror on the left) and turns left through a cased opening, settling on a 10-inch landscape black-glass smart-home touch panel with a brushed-aluminium strip of three buttons down its right edge, mounted at eye level on a plain cream limewash wall above a slim walnut console, its screen softly glowing with a control interface.

**switch**: about 3 s.
> From the touch panel the camera drifts a few steps along the quiet hallway wall of cream limewash and settles on a champagne-coloured matte three-gang smart light switch at hand height, three full-height rockers each with a tiny status dot, sharp in focus, softly lit by a warm downlight.

**curtain**: about 3–4 s.
> The camera turns into the living room toward a tall floor-to-ceiling window with a slim white motorised curtain track across the top and its square white motor housing at the left end. The linen curtains glide open by themselves, revealing olive trees, date palms, the neighbouring compound walls and the golden sky; the sheer breathes gently, dust drifts in the window light. The camera holds on the curtain motor at the top left of the track.

**speaker**: about 2–3 s.
> The camera tilts up gently to the living-room ceiling: a flush round white in-ceiling speaker with a slim bezel, a fine perforated white grille and a small black badge, set into smooth cream plaster, a warm cove light glowing along the edge of the ceiling. Soft, still, elegant.

**sensor**: about 3 s.
> The camera glides past a modern Omani majlis: low cream seating with bronze cushions along the wall, a handwoven rug in camel and madder, a brass mabkhara with a thin curl of frankincense smoke, a dallah coffee pot on a brass tray. It continues toward the kitchen with a travertine island and brass pendant lights, then tilts up to a small round white domed smoke detector with a ring of fine vent holes on the ceiling.

**lock**: about 8–9 s; the door must close by itself.
> The camera walks back through the entrance hall and out through the open front door onto the sunlit porch, then turns around to face the villa. The walnut door swings closed by itself. The camera slowly dollies in to the gloss piano-black push-pull smart lock on the door: a three-lens face-recognition module and a camera at the top, a backlit glass keypad, and a long full-width pull handle over its lower half. Warm sconces glow on either side of the door.

**outro**: about 3 s.
> From the smart lock the camera pulls back and rises smoothly, revealing the porch, the compound wall with bougainvillea and the whole villa against the golden sky, palms and mountains, ending on exactly the hero's opening frame.

## After generating

1. Save each clip as `assets/film/clips/<id>.mp4`.
2. Run `npm run film:encode` and open the site.
3. Live devices: when the film pauses on a device, real HTML is pinned onto it (`src/scripts/film/device-live.ts`): the control panel's screen becomes a working UI (the same layout the 3D paints, `src/data/panel-ui.ts`; the live clock, scenes, draggable light pills, temperature, curtains, music), the switch's backlit dots toggle and dim the room, the lock's keypad wakes and unlocks, the smoke detector's LED beats ("Test" alarms it), the speaker's grille sends out sound rings. For an AI clip, the panel's screen must stay the same UI (or be generated blank) and `features.json` must give its corners, or the live screen will not line up. Live layers exist at the stops only: each comes up once its move has ended and is taken down before the next begins (the per-frame track that kept the panel's screen live during the moves was dropped on 2 Oct 2026: HTML trails a moving video by a frame). At the `app` stop the live layer is the phone (`film/phone.ts`) and the room itself (`film/scene.ts`), see "The app scene" below. Record the tour moves with `--fps=60` and the hero with `--fps=30`: `node scripts/record-film.mjs --only=hero --fps=30` then `--only=panel,switch,curtain,speaker,sensor,app,lock,outro --fps=60`, then `--only=app-scene`.
4. Check that each callout's leader line lands on its device (the panel's button strip, the curtain motor, the lock's keypad). If it doesn't, add an override to `assets/film/hotspots.json` and re-run the encode.
5. Commit `public/film/`, `src/data/film.json` and `public/og.jpg`. The encoder also rewrites the page poster and the OG image from the hero clip.

## Judging speed locally

`astro preview` sends every file uncompressed with `Cache-Control: no-cache`, so the film looks far slower than it will on Cloudflare Pages. Use `npm run build && npm run serve` (`scripts/serve.mjs`, http://localhost:4331): it serves `dist/` with the `_headers` rules (immutable `/film/*`), brotli and byte ranges, as Pages does. The encoder writes H.264 (every browser) and HEVC (`srcHevc`, picked by Safari and Apple devices: ~40 % smaller); a tap normally finds the next clip already buffered, because each stop prepares the next move on arrival.

## Published look (27 Sep 2026)

`film-encode.mjs` first builds one **master** per clip (`scripts/_cache/film-master/<id>.mp4`, 1080p, near-lossless) and cuts
every published size from it:

1. **Steady boxes** (`assets/film/steady.json`, source pixels `[x, y, w, h]`): a temporal median over 15 frames. The hero has
   five wall openings whose coplanar faces z-fight, so they flashed black/cream on every frame; the median holds one colour.
2. **Time resampling with one even shutter**: the clip is interpolated to 4× its frame rate, averaged with a triangle
   kernel and every k-th frame kept (k = 4 × speed, `assets/film/speed.json`, multiples of 0.25). Faster moves stay smooth
   (no dropped-frame judder) and whatever flickers at the frame rate (wind-blown fronds, fine texture under a moving
   camera) is averaged out. The hero loop is wrapped around its seam first, so its first and last frames get the same blend.
   The panel's screen track keeps one quad per recorded frame; its `fps` becomes recorded fps × speed.
3. `deflicker` and a temporal-only `hqdn3d`: lamp light no longer pulses the frame, and the recorded grain no longer crawls
   on still surfaces (it made the picture pop at every keyframe).
4. **The grade** (`LOOK`): deband, a clarity pass (local contrast against a wide blur, clamped), a curve that deepens the
   mids and holds the highlights, +7 % saturation, a faint vignette, a contrast-adaptive sharpen.

Encoding: CRF 19 with 6–7 Mb/s caps (was 22–24 at 2.6–3 Mb/s). The hero is one GOP (a static shot pulsed at every
keyframe); tour clips keep a keyframe every 2 s so stepping back seeks fast.

Speeds now: all ×1 (28 Sep 2026): the camera rig plans every move at its final pace, so the encoder no longer speeds clips up; the seven moves take about 27 s with 0.3 s holds (46.3 s of source before).

The recorder renders without grain or chromatic aberration, the lanterns and fire light only breathe, and the exposure
is about 10 % lower (`house.json` → `exposure`); these apply to the next `npm run film:record`. Note: the 3D scene was
changed after the current recordings (26 Sep 16:57: sky, boulders, lawn, terrain), so re-recording changes the look.

## The app scene (the phone in the living room)

The film is a video, so a room the visitor can change has to be recorded in every state it can be put in.

- **Recording** (`npm run film:record -- --only=app-scene`, after the `app` move): the page is opened at the stop twice, with `?lights=1` and `?lights=0` (the rooms' own lights; the fire, the sky and the sun stay). Every clock is run forward to where the `app` move left it and held there, the incense smoke and the dust motes are hidden (they only live by moving), and the west drapes are posed at 121 positions from parted to drawn; the sky's light through that window follows them. The lights are taken in three states: all on, the table lamps alone (`?lights=0&lamps=1`), all off. Each light state is taken twice: with the bounce-light probes baked for parted drapes (`?bake=1`, as every clip is) and for drawn drapes (`?bake=0`). (Baking again at every position hung the browser after a few frames.) Frame 0 of the lights-on, parted-bake take is the `app` move's last frame. Output: `assets/film/source/app-scene-<on|lamps|off>-b<1|0>.mp4`, `scenes` in the manifest. About 4 s a frame at 1440p (an hour for the six takes); it resumes where it stopped.
- **Encoding** (`film:encode --only=app`): per light state the two bakes are blended by the drapes' position (frame 0 all parted bake, the last all drawn bake), so a drawn room is lit as a drawn room; the result is graded like the film (no deflicker, no temporal denoise: here the light really changes), the three are stacked (on, lamps, off; at 1080p eight rows of padding keep each seam on a block edge, film.json `gap`), the result is played there and back (2N − 1 frames, so both directions play forwards), with a keyframe every 15 frames and no B-frames. One file per rung and codec (`app-scene[-m|-q]`, `app-scene-hevc…`), plus six corner stills. film.json: `clips[app].scene { frames, fps, layers, rungs[{h, w, gap, avc, hevc}], stills }` and `marks`.
- **Playing** (`film/scene.ts`): a canvas in the film's stage over the paused clip. A WebGL pass adds the light the way light adds, in linear light: the unlit room, plus the lamps' share at their level, plus the ceiling's share at its level (the one dimmer runs both: the ceiling comes down first, the lamps' glow last; a dimmed circuit leans warmer). At full it shows the film's own pixels untouched. Without WebGL the same sum is made as cross-fades. The drapes only move the way a motor moves them: the half of the clip that runs the right way plays forwards and halts on the frame it was sent to. Open / Close / a scene start softly at 1.5×; a finger on the slider is followed at up to 3× (a new mark the same way only moves the stop; a seek happens only when the drapes turn round). The slider's knob stays where the finger left it while the drapes catch up. When the tour moves on, the canvas dissolves back into the clip's own frame and the room's video element is let go of.
- **Fetched whole** (3 Oct 2026): the room's file is fetched into memory at the stop before and played from a `blob:` URL (the page's CSP allows `media-src 'self' blob:`). Seeking needs byte ranges, and the live host answers a range request with the whole file; Chrome then takes the video for a stream it can only seek to its start, so every drag and scene began from parted drapes. The film's own clips only ever seek to 0 on the way forward (the Left-arrow step back seeks near a clip's end and suffers the same until the host serves ranges). Test against a server without ranges (`python3 -m http.server -d dist`), not `npm run serve`, which has them.
- **Fallbacks**: the stacked video is checked with `mediaCapabilities` and the rung stepped down; if none decodes (or the visitor gets stills: reduced motion, data saver, `?slides`), the four corner stills are blended (the drapes dissolve instead of travelling). The stills also stand in while the file is still on its way (a slow line); the video takes over at the drapes' position as soon as it is in.
- **Changing the room or the pose** means recording `app`, `app-scene` and `lock` again (the exit starts on that frame).
