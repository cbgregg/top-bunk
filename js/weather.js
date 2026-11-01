// The weather: rain that follows the camera, the ground going wet and dark under it, and on storm nights lightning over the field across the
// road with the thunder rolling in after it. Which nights are wet comes from the run's seed (weatherFor in director.js).
// The rain is one cloud of short line streaks in a box around the camera; the shader drops every streak that would fall inside the house or the
// garage, so from indoors the rain only shows through the windows. Kinds: 'clear' | 'wet' (after a rainy night: the ground still dark) | 'rain' | 'storm'.
import * as THREE from 'three';
import { PHONE } from './gfx.js';

const N = PHONE ? 600 : 2400;   // streaks in the cloud

export function createWeather(scene, camera, W, sfx) {
  // ---- the streaks: two vertices each; seed = where in the box, end = top (1) or bottom (0) of the streak, rnd = its own speed ----
  const geo = new THREE.BufferGeometry(), seed = new Float32Array(N * 6), end = new Float32Array(N * 2), rnd = new Float32Array(N * 2);
  for (let i = 0; i < N; i++) {
    const x = Math.random(), y = Math.random(), z = Math.random(), r = Math.random();
    for (const k of [0, 1]) { seed.set([x, y, z], (i * 2 + k) * 3); end[i * 2 + k] = k; rnd[i * 2 + k] = r; }
  }
  geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 6), 3));   // unused: the shader places everything
  geo.setAttribute('seed', new THREE.BufferAttribute(seed, 3)); geo.setAttribute('end', new THREE.BufferAttribute(end, 1)); geo.setAttribute('rnd', new THREE.BufferAttribute(rnd, 1));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);   // never culled
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    time: { value: 0 }, center: { value: new THREE.Vector3() }, size: { value: new THREE.Vector3(28, 14, 28) }, fall: { value: 9.5 }, len: { value: 0.45 },
    wind: { value: new THREE.Vector2(0.12, 0.04) }, alpha: { value: 0 }, color: { value: new THREE.Color(0xb9c4d2) },
  }]);
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: true,
    vertexShader: `
      attribute vec3 seed; attribute float end; attribute float rnd;
      uniform float time, fall, len, alpha; uniform vec3 center, size; uniform vec2 wind;
      varying float vA; varying vec3 vW;
      #include <fog_pars_vertex>
      void main() {
        float sp = fall * (0.8 + 0.4 * rnd);
        float y = mod(seed.y * size.y - time * sp, size.y);
        vec3 p = vec3(center.x + (seed.x - 0.5) * size.x, center.y - size.y * 0.35 + y, center.z + (seed.z - 0.5) * size.z);
        p.xz += wind * (size.y - y) * 0.6;                      // the drops lean with the wind as they come down
        p += vec3(wind.x, 1.0, wind.y) * len * end;              // the top of the streak
        vW = p; vA = alpha * (1.0 - end * 0.85);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `
      uniform vec3 color; varying float vA; varying vec3 vW;
      #include <fog_pars_fragment>
      void main() {
        if (vW.y < 0.0) discard;
        if (vW.y < 3.4 && vW.x > -8.3 && vW.x < 8.3 && vW.z > -4.7 && vW.z < 3.8) discard;        // inside the house
        if (vW.y < 3.4 && vW.x > -14.2 && vW.x < -7.4 && vW.z > -13.8 && vW.z < -6.8) discard;   // the garage
        gl_FragColor = vec4(color, vA);
        #include <fog_fragment>
      }`,
  });
  const rain = new THREE.LineSegments(geo, mat); rain.frustumCulled = false; rain.visible = false; rain.renderOrder = 1; scene.add(rain);   // drawn before the window panes (renderOrder 2), which write depth

  // ---- lightning: a sheet of cold light from over the field across the road ----
  // on a phone the sheet of light is a lift of the sky and the fog instead of a light (one more light is one more pass over every surface)
  const bolt = new THREE.DirectionalLight(0xd6dfff, 0); bolt.position.set(30, 70, -120); bolt.target.position.set(0, 0, -30); if (!PHONE) scene.add(bolt, bolt.target);
  const skyFlash = (v) => { if (!(scene.background && scene.background.isColor)) return; if (v > 0 && !S.skyBase) { S.skyBase = scene.background.clone(); S.fogBase = scene.fog ? scene.fog.color.clone() : null; } if (!S.skyBase) return; scene.background.copy(S.skyBase).addScalar(v * 0.22); if (scene.fog && S.fogBase) scene.fog.color.copy(S.fogBase).addScalar(v * 0.18); if (v === 0) { S.skyBase = null; S.fogBase = null; } };

  // ---- the ground going wet: these materials darken and lose their roughness ----
  // sealed surfaces (asphalt, paint, concrete) go glassy; gravel and dirt only darken and dull a little. The dry values are read the first
  // time the ground has to get wet, well after the PBR sets have loaded and set the real colours and roughness
  let wet = null;
  const dryValues = () => (W.wetMats || []).map((m) => ({ m, rough: m.roughness, color: m.color.clone(), k: m.roughnessMap || m === W.M.tar || m === W.M.paintY || m === W.M.paintW ? 0.72 : 0.3 }));

  const fwd = new THREE.Vector3();
  const S = { kind: 'clear', goal: 0, k: 0, wetK: 0, wetGoal: 0, locked: null, time: 0, inside: false, heard: -1, next: 0, flashT: -1, flashes: [], gust: 0 };
  const applyKind = (kind) => {
    S.kind = kind;
    S.goal = kind === 'storm' ? 1 : kind === 'rain' ? 0.72 : 0;
    S.wetGoal = kind === 'storm' || kind === 'rain' ? 1 : kind === 'wet' ? 0.75 : 0;
    S.next = 6 + Math.random() * 12;
  };
  const weather = {
    get kind() { return S.kind; },
    get raining() { return S.goal > 0; },
    get intensity() { return S.k; },
    // the trailer and tests set the weather by hand; a locked kind ignores what the nights ask for until unlock()
    set(kind) { if (!S.locked) applyKind(kind); },
    lock(kind) { S.locked = kind; applyKind(kind); },
    unlock() { S.locked = null; },
    jump() { S.k = S.goal; S.wetK = S.wetGoal; },   // no fade-in (a phase change behind a black screen)
    // one flash now: a few bursts over half a second, the thunder `delay` seconds behind it
    flash(delay = 0.8 + Math.random() * 3.2, gain = 1) {
      const n = 2 + Math.floor(Math.random() * 3), list = [];
      for (let i = 0; i < n; i++) list.push({ at: i * (0.08 + Math.random() * 0.14), len: 0.05 + Math.random() * 0.12, v: (i === n - 1 ? 1 : 0.5 + Math.random() * 0.5) * 7 * gain });
      S.flashes = list; S.flashT = 0; bolt.position.set(-60 + Math.random() * 140, 70, -120);
      sfx.thunder(delay, gain * (0.5 + 0.5 * Math.max(0, 1 - delay / 5)));
    },
    bolt,
    // night: whether the stars are meant to be out (they go behind the cloud while it rains)
    update(dt, inside = false, night = false) {
      S.time += dt; S.inside = inside;
      const cloud = S.k > 0.2; if (cloud !== S.cloud || night !== S.night) { S.cloud = cloud; S.night = night; W.stars.visible = W.moon.visible = night && !cloud; }
      const rate = S.goal > S.k ? dt / 7 : dt / 4;   // rain comes on over a few seconds and stops a little faster
      S.k += Math.max(-rate, Math.min(rate, S.goal - S.k));
      const wrate = S.wetGoal > S.wetK ? dt / 12 : dt / 90;   // dries slowly
      S.wetK += Math.max(-wrate, Math.min(wrate, S.wetGoal - S.wetK));
      // the streaks
      const on = S.k > 0.01;
      rain.visible = on;
      if (on) {
        // the cloud sits ahead of the camera rather than around it, so from indoors there is still rain to see through the window
        uniforms.time.value = S.time; camera.getWorldDirection(fwd); fwd.y = 0;
        uniforms.center.value.copy(camera.position); if (fwd.lengthSq() > 1e-4) uniforms.center.value.addScaledVector(fwd.normalize(), 7);   // (looking straight down: no direction to lean toward)
        S.gust += dt * (0.3 + S.k * 0.4);
        const w = 0.08 + 0.3 * S.k * (0.5 + 0.5 * Math.sin(S.gust)) + 0.05 * Math.sin(S.gust * 2.7);
        uniforms.wind.value.set(w, w * 0.3 * Math.sin(S.gust * 0.6));
        uniforms.alpha.value = 0.48 * Math.min(1, S.k * 1.4) * (S.flashT >= 0 ? 2.2 : 1);
        uniforms.fall.value = 8 + 3 * S.k; uniforms.len.value = 0.35 + 0.25 * S.k;
        geo.setDrawRange(0, Math.floor(N * Math.min(1, S.k * 1.15)) * 2);
      }
      // wet ground
      if (S.wetK > 0 || S.wetGoal > 0) { wet ||= dryValues(); for (const e of wet) { e.m.roughness = e.rough * (1 - e.k * S.wetK); e.m.color.copy(e.color).multiplyScalar(1 - 0.45 * S.wetK); } }
      if (W.puddles) { W.puddles.visible = S.wetK > 0.25; for (const p of W.puddles.children) p.material.opacity = Math.min(0.9, (S.wetK - 0.25) * 1.6); }
      if (W.streetLight) W.streetLight.haze = S.k;   // the beam shows in the rain
      // the sound: outside it is all around you, inside it is on the roof and the glass
      const heard = Math.round(S.k * 20) / 20;
      if (heard !== S.heard || inside !== S.wasInside) { S.heard = heard; S.wasInside = inside; sfx.rain(heard, inside, 1.5); }
      // lightning
      if (S.flashT >= 0) {
        S.flashT += dt; let v = 0, done = true;
        for (const f of S.flashes) { if (S.flashT < f.at + f.len) done = false; if (S.flashT >= f.at && S.flashT < f.at + f.len) v = Math.max(v, f.v); }
        if (PHONE) skyFlash(v); else bolt.intensity = v;
        if (done) { S.flashT = -1; if (PHONE) skyFlash(0); else bolt.intensity = 0; }
      } else if (S.kind === 'storm' && S.k > 0.5) { S.next -= dt; if (S.next <= 0) { S.next = 14 + Math.random() * 38; weather.flash(); } }
    },
  };
  return weather;
}
