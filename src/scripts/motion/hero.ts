/** Page heroes: the breadcrumbs, title, rule and lead rise in once, one after another (CSS, from .is-in). */
export function initPageHero() {
  const hero = document.querySelector<HTMLElement>('[data-ph]');
  if (hero) requestAnimationFrame(() => hero.classList.add('is-in'));
}
