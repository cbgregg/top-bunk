// small number helpers shared by the creature and its body
export const lerp = (a, b, t) => a + (b - a) * t;
// smoothstep in glsl argument order; e0 may be above e1 for a falling edge
export const smoothstep = (e0, e1, x) => { const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };
// a repeatable pseudo-random 0..1 from a number
export const hash = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
