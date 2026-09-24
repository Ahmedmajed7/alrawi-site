/** Web3Forms when an access key is configured in site.json; otherwise a mailto: fallback. */
export function initContactForm() {
  document.querySelectorAll<HTMLFormElement>('[data-contact-form]').forEach((form) => {
    const status = form.querySelector<HTMLElement>('[data-status]')!;
    const btn = form.querySelector<HTMLButtonElement>('[data-send]')!;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      status.className = 'form-status';
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const fd = new FormData(form);
      if (fd.get('botcheck')) return; // honeypot
      const name = String(fd.get('name') || ''), phone = String(fd.get('phone') || ''), message = String(fd.get('message') || '');
      const endpoint = form.dataset.endpoint;
      if (!endpoint) {
        const subject = encodeURIComponent(`Website enquiry from ${name}`);
        const body = encodeURIComponent(`${message}\n\nName: ${name}\nPhone: ${phone}`);
        status.textContent = status.dataset.mailto || '';
        location.href = `mailto:${form.dataset.mail}?subject=${subject}&body=${body}`;
        return;
      }
      btn.disabled = true; btn.textContent = btn.dataset.sending || '';
      try {
        const res = await fetch('https://api.web3forms.com/submit', {
          method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ access_key: endpoint, name, phone, message, subject: `Website enquiry from ${name}`, from_name: 'alrawioman.com' }),
        });
        const json = await res.json();
        if (!res.ok || !json.success) throw new Error('failed');
        status.textContent = status.dataset.ok || ''; status.classList.add('ok'); form.reset();
      } catch {
        status.textContent = status.dataset.fail || ''; status.classList.add('fail');
      } finally { btn.disabled = false; btn.textContent = btn.dataset.label || ''; }
    });
  });
}
