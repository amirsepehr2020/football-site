(() => {
  const loadFloatingHeader = () => {
    if (!document.querySelector('link[data-floating-header]')) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = '/floating-header.css';
      link.dataset.floatingHeader = 'true';
      document.head.appendChild(link);
    }
    if (!document.querySelector('script[data-floating-header]')) {
      const script = document.createElement('script');
      script.src = '/floating-header.js';
      script.defer = true;
      script.dataset.floatingHeader = 'true';
      document.body.appendChild(script);
    }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', loadFloatingHeader, { once: true });
  else loadFloatingHeader();

  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', async () => {
    try {
      const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
      registration.update();

      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        if (!worker) return;

        worker.addEventListener('statechange', () => {
          if (worker.state === 'installed' && navigator.serviceWorker.controller) {
            showUpdateToast();
          }
        });
      });
    } catch (error) {
      console.warn('KICKORA PWA service worker registration failed:', error);
    }
  });

  function showUpdateToast() {
    const toast = document.querySelector('#toast');
    if (!toast) return;

    toast.textContent = 'نسخه جدید کیکورا آماده است؛ صفحه را تازه‌سازی کن.';
    toast.classList.add('show');
    window.setTimeout(() => toast.classList.remove('show'), 5000);
  }
})();
