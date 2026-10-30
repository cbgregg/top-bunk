// A car's headlights slide across the bedroom, and then a huge pale face drifts past each window outside, moaning "eeeyyyeee".
// Both lights live in the scene all along (a constant light count means no hitch).
import * as THREE from 'three';

const V = THREE.Vector3;

export class WindowFace {
  constructor(scene, faceLight, carLight) {
    this.light = faceLight; this.car = carLight;
    this.t = -1; this.dur = 13; this.ct = -1; this.cdur = 4.2; this.clock = 0;
    const white = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
    white.color.setRGB(1.55, 1.6, 1.8);
    const hollow = new THREE.MeshBasicMaterial({ color: 0x040406, fog: false });
    this.root = new THREE.Group(); this.root.visible = false; scene.add(this.root);
    const head = new THREE.Mesh(new THREE.SphereGeometry(1, 40, 28), white); head.scale.set(0.95, 1.28, 0.55); this.root.add(head);
    for (const s of [-1, 1]) {
      const eye = new THREE.Mesh(new THREE.SphereGeometry(0.22, 20, 14), hollow);
      eye.scale.set(0.8, 1.9, 0.3); eye.position.set(s * 0.36, 0.4, 0.5); eye.rotation.z = s * 0.28; this.root.add(eye);
    }
    this.mouth = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), hollow);
    this.mouth.position.set(0, -0.62, 0.5); this.mouth.scale.set(1.1, 1, 0.3); this.root.add(this.mouth);
    // past the bedroom end window, then along the end wall and your side window, round the back corner and along the back wall
    // (past your back window, behind the top bunk), and on past the bathroom and kitchen
    this.path = new THREE.CatmullRomCurve3([new V(9.3, 1.8, -4.8), new V(9.3, 1.8, -3.0), new V(9.3, 1.8, 0.4), new V(9.2, 1.8, 2.5), new V(8.6, 1.8, 4.6), new V(7.0, 1.8, 5.0), new V(5.0, 1.8, 5.1), new V(2.0, 1.8, 5.1), new V(-1.5, 1.8, 5.1), new V(-5.0, 1.8, 5.1), new V(-9.4, 1.8, 3.0)]);
    this.carPath = new THREE.LineCurve3(new V(40, 0.8, -30), new V(-40, 0.8, -30));   // along the road in front of the house
    this.look = new V(6.6, 1.6, 1.5);
  }
  face() { this.t = 0; this.root.visible = true; }
  carPass() { this.ct = 0; this.car.shadow.autoUpdate = true; }

  update(dt) {
    this.clock += dt;
    if (this.t >= 0) {
      this.t += dt / this.dur;
      if (this.t >= 1) { this.t = -1; this.root.visible = false; this.light.intensity = 0; }
      else {
        const k = this.t, ease = k * k * (3 - 2 * k) * 0.35 + k * 0.65;   // drifts slowly, a little faster in the middle
        this.path.getPointAt(Math.min(1, ease), this.root.position);
        this.root.position.y += Math.sin(this.clock * 0.8) * 0.08;
        this.root.lookAt(this.look); this.root.rotation.z = Math.sin(this.clock * 0.5) * 0.12;
        const open = 0.35 + 0.65 * Math.abs(Math.sin(this.clock * 1.1)); this.mouth.scale.set(1.1, 0.5 + open * 1.5, 0.3);
        this.light.position.copy(this.root.position).lerp(this.look, 0.15);
        this.light.intensity = 9 * Math.min(1, k * 6, (1 - k) * 6);
      }
    }
    if (this.ct >= 0) {
      this.ct += dt / this.cdur;
      if (this.ct >= 1) { this.ct = -1; this.car.intensity = 0; this.car.shadow.autoUpdate = false; }
      else {
        this.carPath.getPointAt(this.ct, this.car.position);
        this.car.target.position.set(this.car.position.x * 0.55 + 1.5, 1.3, 1.0); this.car.target.updateMatrixWorld();
        this.car.intensity = 420 * Math.min(1, this.ct * 8, (1 - this.ct) * 8);
      }
    }
  }
}
