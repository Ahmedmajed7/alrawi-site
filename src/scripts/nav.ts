export function initNav() {
  const nav = document.querySelector<HTMLElement>('[data-nav]');
  const burger = document.querySelector<HTMLButtonElement>('[data-burger]');
  const drawer = document.querySelector<HTMLElement>('[data-drawer]');
  if (!nav) return;

  let last = 0;
  const onScroll = () => {
    const y = window.scrollY;
    nav.classList.toggle('is-scrolled', y > 24);
    // hide on scroll down, show on scroll up (desktop only, not while drawer open)
    if (window.innerWidth > 960 && !nav.classList.contains('is-open')) {
      nav.classList.toggle('is-hidden', y > last && y > 320);
    } else nav.classList.remove('is-hidden');
    last = y;
    // switch nav to light when scrolled past the dark hero
    const hero = document.querySelector<HTMLElement>('[data-hero]');
    if (hero && nav.dataset.light === '0') {
      nav.classList.toggle('is-light', y > hero.offsetHeight - 80);
    }
  };
  onScroll();
  window.addEventListener('scroll', onScroll, { passive: true });

  if (burger && drawer) {
    const set = (open: boolean) => {
      nav.classList.toggle('is-open', open);
      drawer.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', String(open));
      document.body.classList.toggle('no-scroll', open);
    };
    burger.addEventListener('click', () => set(!nav.classList.contains('is-open')));
    drawer.querySelectorAll('a').forEach((a) => a.addEventListener('click', () => set(false)));
    window.addEventListener('keydown', (e) => e.key === 'Escape' && set(false));
  }
}
