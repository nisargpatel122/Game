// Install button on the title screen. Chrome's own menu can wrongly say "already
// installed" when another game from the same github.io site is installed, so the
// game offers the browser's install prompt itself whenever it is available.
(function () {
  let pending = null;
  const btn = () => document.getElementById('btn-install');
  const installed = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    pending = e;
    if (btn() && !installed()) btn().classList.remove('hidden');
  });
  window.addEventListener('appinstalled', () => {
    pending = null;
    if (btn()) btn().classList.add('hidden');
  });
  document.addEventListener('click', (e) => {
    if (!pending || !e.target.closest || !e.target.closest('#btn-install')) return;
    const ev = pending;
    pending = null;
    btn().classList.add('hidden');
    ev.prompt();
  });
})();
