/**
 * The glow round the band (upright screens, film/stage.ts): the picture on screen copied into a 32×18 canvas that the CSS
 * blows up and blurs behind the band (05-walkthrough.css `.walk-glow`), so the film's own light spills softly into the
 * night ground instead of ending at two black bars. A tiny GPU canvas, never read back: drawing a video frame into it is a
 * scaled blit. It runs only while the film is on screen in band mode; machines without a live blur behind the HUD glass
 * (`hud-lite`) redraw it once per stop instead of ten times a second.
 */
import { upright } from './stage';

type Picture = HTMLVideoElement | HTMLImageElement | HTMLCanvasElement;
const W = 32, H = 18;

export function createGlow(root: HTMLElement) {
  const c = root.querySelector<HTMLCanvasElement>('[data-walk-glow]');
  const g = c?.getContext('2d', { alpha: false }) ?? null;
  let timer = 0, broken = !g;

  const draw = (v: Picture | null) => {
    if (broken || !v || !upright.matches) return;
    const ok = v instanceof HTMLVideoElement ? v.readyState >= 2 && v.videoWidth > 0 : v instanceof HTMLImageElement ? v.complete && v.naturalWidth > 0 : v.width > 0;
    if (!ok) return;
    try { g!.drawImage(v, 0, 0, W, H); c!.classList.add('is-on'); } catch { broken = true; }
  };
  return {
    draw,
    /** keep copying `get()` while the film is on screen; `stop()` ends it */
    watch(get: () => Picture | null) {
      clearInterval(timer); draw(get());
      if (!root.classList.contains('hud-lite')) timer = window.setInterval(() => draw(get()), 100);
    },
    stop() { clearInterval(timer); timer = 0; },
  };
}
