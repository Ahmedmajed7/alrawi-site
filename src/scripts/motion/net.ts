/** The Dartz constellation, in brass and navy: drifting points joined by hairlines when close, warming toward the
    pointer. ~40 ticks/s, DPR ≤ 2, paused off-screen, when the tab is hidden and under reduced motion. */
import { reduced, finePointer } from './loop';

export function initNets() {
  if (reduced()) return;
  document.querySelectorAll<HTMLCanvasElement>('canvas[data-net]').forEach((cv) => {
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const host = cv.parentElement!;
    // palette: brass on navy by default; the hero after the film uses the logo's navy, blue and green
    const logo = cv.dataset.net === 'logo';
    const far = '#18254f', hot = logo ? ['#3b99d4', '#60bc50'] : ['#a98a5b', '#a98a5b'];
    let W = 0, H = 0, dpr = 1, pts: { x: number; y: number; vx: number; vy: number }[] = [];
    let mx = -999, my = -999, on = false, raf = 0, last = 0;
    const size = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1); W = host.clientWidth; H = host.clientHeight;
      cv.width = W * dpr; cv.height = H * dpr; cv.style.width = `${W}px`; cv.style.height = `${H}px`;
      const n = W < 700 ? 24 : 50;
      pts = Array.from({ length: n }, () => ({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18 }));
    };
    const nearC = (i: number) => hot[i % 2];
    const draw = (t: number) => {
      raf = on ? requestAnimationFrame(draw) : 0;
      if (t - last < 24) return; const dt = Math.min(3, (t - last) / 16.7); last = t;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
      for (const p of pts) { p.x += p.vx * dt; p.y += p.vy * dt; if (p.x < 0 || p.x > W) p.vx *= -1; if (p.y < 0 || p.y > H) p.vy *= -1; }
      ctx.lineWidth = 1;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i];
        for (let j = i + 1; j < pts.length; j++) {
          const b = pts[j], d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d > 130) continue;
          const near = Math.hypot((a.x + b.x) / 2 - mx, (a.y + b.y) / 2 - my) < 170;
          ctx.globalAlpha = (1 - d / 130) * (near ? 0.55 : 0.16);
          ctx.strokeStyle = near ? nearC(i) : far;
          ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
        }
        const near = Math.hypot(a.x - mx, a.y - my) < 130;
        ctx.globalAlpha = near ? 0.9 : (logo && i % 5 === 0 ? 0.6 : 0.35); ctx.fillStyle = near ? nearC(i) : (logo && i % 5 === 0 ? (i % 2 ? hot[0] : hot[1]) : far);
        ctx.beginPath(); ctx.arc(a.x, a.y, near ? 2 : 1.4, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
    };
    size();
    new ResizeObserver(() => size()).observe(host);
    new IntersectionObserver(([e]) => { on = e.isIntersecting && !document.hidden; if (on && !raf) raf = requestAnimationFrame(draw); }).observe(cv);
    document.addEventListener('visibilitychange', () => { on = !document.hidden && on; if (on && !raf) raf = requestAnimationFrame(draw); });
    if (finePointer()) host.addEventListener('pointermove', (e) => { const r = cv.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; }, { passive: true });
  });
}
