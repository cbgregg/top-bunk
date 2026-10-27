// Seeded randomness: the same seed always plays out the same nights.
export function hashSeed(str) {   // xmur3
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^= h >>> 16) >>> 0;
}
export function rng(seed) {   // mulberry32
  let a = (typeof seed === 'string' ? hashSeed(seed) : seed) >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  return r;
}
export const pick = (r, arr) => arr[(r() * arr.length) | 0];
export const between = (r, a, b) => a + r() * (b - a);
export function shuffle(r, arr) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
export function weighted(r, items) {   // items: [[value, weight], ...]
  let t = 0; for (const [, w] of items) t += w;
  let x = r() * t; for (const [v, w] of items) { if ((x -= w) <= 0) return v; }
  return items[items.length - 1][0];
}
// a short readable seed ("K7QX-29MD")
export function newSeed() {
  const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let s = '';
  for (let i = 0; i < 8; i++) { s += c[(Math.random() * c.length) | 0]; if (i === 3) s += '-'; }
  return s;
}
