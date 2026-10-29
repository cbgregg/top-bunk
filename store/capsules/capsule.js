// Capsule templates: `?s=2` renders the same layout at twice the size (the renderer sets the viewport to match), and the page reports
// when its fonts and images are in (data-ready on <html>) so render_capsules.js captures nothing half-loaded.
(() => {
  const s = +new URLSearchParams(location.search).get('s') || 1;
  if (s !== 1) document.documentElement.style.zoom = s;
  const imgs = () => Array.from(document.images);
  const loaded = () => imgs().every((i) => i.complete);
  const done = () => { document.documentElement.dataset.ready = loaded() ? '1' : ''; };
  addEventListener('load', () => { document.fonts.ready.then(() => { done(); for (const i of imgs()) { i.addEventListener('load', done); i.addEventListener('error', done); } }); });
})();
