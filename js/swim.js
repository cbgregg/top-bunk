// one frame of the dream swim: the room turns over, the lens swings and the colours go wrong. k runs 0..1 over the dream.
export function swimFrame(P, setFovOff, k, pitch0, yaw0) {
  P.roll = Math.sin(k * 15) * 0.5 * (1 - k * 0.5);
  P.pitch = pitch0 + Math.sin(k * 11) * 0.3;
  P.yaw = yaw0 + Math.sin(k * 9) * 0.12;
  setFovOff(-34 + Math.sin(k * 13) * 34);
}
