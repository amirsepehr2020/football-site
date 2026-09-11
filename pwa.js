(() => {
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
