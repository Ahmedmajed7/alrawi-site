/** Titles rise in letter by letter (Latin) or word by word (Arabic: never split inside a word, it breaks the joining).
    Inline markup (<em>, <br>) is kept; the heading keeps its plain text as its accessible name. */
import { isAr } from './loop';

export function splitTitles(root: ParentNode = document) {
  const ar = isAr();
  root.querySelectorAll<HTMLElement>('[data-split]').forEach((el) => {
    if (el.dataset.splitDone) return; el.dataset.splitDone = '1';
    const label = el.textContent?.replace(/\s+/g, ' ').trim() || '';
    let i = 0;
    const walk = (node: Node, into: Node) => {
      node.childNodes.forEach((n) => {
        if (n.nodeType === 3) {
          const parts = (n.textContent || '').split(/(\s+)/);
          for (const part of parts) {
            if (!part) continue;
            if (/^\s+$/.test(part)) { into.appendChild(document.createTextNode(' ')); continue; }
            const w = document.createElement('span'); w.className = 'sw';
            if (ar) { w.style.setProperty('--i', String(i++)); w.textContent = part; }
            else for (const ch of part) { const c = document.createElement('span'); c.className = 'sc'; c.style.setProperty('--i', String(i++)); c.textContent = ch; w.appendChild(c); }
            into.appendChild(w);
          }
        } else if (n.nodeType === 1) {
          const clone = (n as Element).cloneNode(false); into.appendChild(clone); walk(n, clone);
        }
      });
    };
    const frag = document.createElement('span'); frag.className = 'split'; frag.setAttribute('aria-hidden', 'true');
    walk(el, frag);
    el.textContent = ''; el.appendChild(frag); el.setAttribute('aria-label', label);
    el.style.setProperty('--n', String(i));
  });
}
