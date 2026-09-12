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

  const setupBottomNavigation = () => {
    const nav = document.querySelector('.mobile-bottom-nav');
    if (!nav) return;

    document.body.style.position = 'relative';
    if (!document.body.style.paddingBottom) {
      document.body.style.paddingBottom = '92px';
    }

    let atPageEnd = false;
    const updatePosition = () => {
      const nextAtPageEnd = window.scrollY + window.innerHeight >= document.documentElement.scrollHeight - 4;
      if (nextAtPageEnd === atPageEnd) return;
      atPageEnd = nextAtPageEnd;

      nav.style.position = atPageEnd ? 'absolute' : 'fixed';
      nav.style.bottom = atPageEnd ? '0px' : '';
      nav.style.transition = 'transform .28s ease, bottom .28s ease';
    };

    window.addEventListener('scroll', updatePosition, { passive: true });
    window.addEventListener('resize', updatePosition);
    updatePosition();
  };

  const init = () => {
    loadFloatingHeader();
    setupBottomNavigation();
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else init();

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
