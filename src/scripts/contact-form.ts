/** Web3Forms when an access key is configured in site.json; otherwise a mailto: fallback. */
export function initContactForm() {
  document.querySelectorAll<HTMLFormElement>('[data-contact-form]').forEach((form) => {
    if (form.dataset.bound) return; form.dataset.bound = '1';
    const status = form.querySelector<HTMLElement>('[data-status]')!;
    const btn = form.querySelector<HTMLButtonElement>('[data-send]')!;
    const label = form.querySelector<HTMLElement>('[data-send-label]')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const fd = new FormData(form);
      if (fd.get('botcheck')) return; // honeypot
      const v = (k: string) => String(fd.get(k) || '');
      const name = `${v('first')} ${v('last')}`.trim();
      const subject = `${v('type')}: website enquiry from ${name}`;
      const text = `${v('message')}\n\nName: ${name}\nEmail: ${v('email')}\nPhone: ${v('phone')}\nEnquiry: ${v('type')}`;
      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        status.textContent = status.dataset.mailto || '';
        location.href = `mailto:${form.dataset.mail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
        return;
      }
      btn.disabled = true; label.textContent = btn.dataset.sending || '';
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ access_key: endpoint, name, email: v('email'), phone: v('phone'), enquiry: v('type'), message: v('message'), subject, from_name: 'alrawioman.com' }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error('failed');
        status.textContent = status.dataset.ok || ''; status.classList.add('ok'); form.reset();
      } catch {
        status.textContent = status.dataset.fail || ''; status.classList.add('fail');
      } finally { btn.disabled = false; label.textContent = btn.dataset.label || ''; }
    });
  });
}
