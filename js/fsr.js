// FidelityFX Super Resolution 1 (FSR 1) in WebGL: EASU, an edge-adaptive upsampling of a smaller picture to the canvas, then RCAS, a
// contrast-adaptive sharpening of the result. The scene is drawn with fewer pixels and FSR fills the screen from it; it is spatial (one
// frame, no motion vectors), so it runs on any card in any browser.
//
// A port of ffx_fsr1.h from the FidelityFX SDK:
// Copyright (c) 2021 Advanced Micro Devices, Inc. All rights reserved.
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the
// "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish,
// distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to
// the following conditions: The above copyright notice and this permission notice shall be included in all copies or substantial portions
// of the Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE
// WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS
// BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
// CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
import * as THREE from 'three';
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js';

const VERT = 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';

// EASU: twelve taps around the output pixel's place in the small picture, a lanczos-like kernel stretched along the local edge, the result
// held between the four nearest texels (no ringing)
const EASU = /* glsl */`
  uniform sampler2D tInput;
  uniform vec2 inSize;
  varying vec2 vUv;
  vec3 T(vec2 p) { return texture2D(tInput, (p + 0.5) / inSize).rgb; }
  float L(vec3 c) { return c.g + 0.5 * (c.r + c.b); }
  // one bilinear corner's share of the edge direction and length
  void setF(inout vec2 dir, inout float len, float w, float lA, float lB, float lC, float lD, float lE) {
    float dirX = lD - lB, lenX = max(abs(lD - lC), abs(lC - lB));
    dir.x += dirX * w;
    lenX = clamp(abs(dirX) / max(lenX, 1e-5), 0.0, 1.0); len += lenX * lenX * w;
    float dirY = lE - lA, lenY = max(abs(lE - lC), abs(lC - lA));
    dir.y += dirY * w;
    lenY = clamp(abs(dirY) / max(lenY, 1e-5), 0.0, 1.0); len += lenY * lenY * w;
  }
  void tap(inout vec3 aC, inout float aW, vec2 off, vec2 dir, vec2 len2, float lob, float clp, vec3 c) {
    vec2 v = vec2(dot(off, dir), dot(off, vec2(-dir.y, dir.x))) * len2;
    float d2 = min(dot(v, v), clp);
    float wB = 0.4 * d2 - 1.0, wA = lob * d2 - 1.0;
    wB *= wB; wA *= wA;
    wB = 1.5625 * wB - 0.5625;
    float w = wB * wA;
    aC += c * w; aW += w;
  }
  void main() {
    vec2 pp = vUv * inSize - 0.5, fp = floor(pp);
    pp -= fp;
    //    b c
    //  e f g h
    //  i j k l
    //    n o
    vec3 bC = T(fp + vec2(0, -1)), cC = T(fp + vec2(1, -1));
    vec3 eC = T(fp + vec2(-1, 0)), fC = T(fp), gC = T(fp + vec2(1, 0)), hC = T(fp + vec2(2, 0));
    vec3 iC = T(fp + vec2(-1, 1)), jC = T(fp + vec2(0, 1)), kC = T(fp + vec2(1, 1)), lC = T(fp + vec2(2, 1));
    vec3 nC = T(fp + vec2(0, 2)), oC = T(fp + vec2(1, 2));
    float bL = L(bC), cL = L(cC), eL = L(eC), fL = L(fC), gL = L(gC), hL = L(hC);
    float iL = L(iC), jL = L(jC), kL = L(kC), lL = L(lC), nL = L(nC), oL = L(oC);
    vec2 dir = vec2(0.0); float len = 0.0;
    setF(dir, len, (1.0 - pp.x) * (1.0 - pp.y), bL, eL, fL, gL, jL);
    setF(dir, len, pp.x * (1.0 - pp.y), cL, fL, gL, hL, kL);
    setF(dir, len, (1.0 - pp.x) * pp.y, fL, iL, jL, kL, nL);
    setF(dir, len, pp.x * pp.y, gL, jL, kL, lL, oL);
    vec2 dir2 = dir * dir;
    float dirR = dir2.x + dir2.y;
    bool zro = dirR < 1.0 / 32768.0;
    dirR = zro ? 1.0 : inversesqrt(dirR);
    dir.x = zro ? 1.0 : dir.x;
    dir *= dirR;
    len = len * 0.5; len *= len;
    float stretch = dot(dir, dir) / max(abs(dir.x), abs(dir.y));
    vec2 len2 = vec2(1.0 + (stretch - 1.0) * len, 1.0 - 0.5 * len);
    float lob = 0.5 + ((1.0 / 4.0 - 0.04) - 0.5) * len, clp = 1.0 / lob;
    vec3 mn4 = min(min(fC, gC), min(jC, kC)), mx4 = max(max(fC, gC), max(jC, kC));
    vec3 aC = vec3(0.0); float aW = 0.0;
    tap(aC, aW, vec2(0.0, -1.0) - pp, dir, len2, lob, clp, bC);
    tap(aC, aW, vec2(1.0, -1.0) - pp, dir, len2, lob, clp, cC);
    tap(aC, aW, vec2(-1.0, 1.0) - pp, dir, len2, lob, clp, iC);
    tap(aC, aW, vec2(0.0, 1.0) - pp, dir, len2, lob, clp, jC);
    tap(aC, aW, vec2(0.0, 0.0) - pp, dir, len2, lob, clp, fC);
    tap(aC, aW, vec2(-1.0, 0.0) - pp, dir, len2, lob, clp, eC);
    tap(aC, aW, vec2(1.0, 1.0) - pp, dir, len2, lob, clp, kC);
    tap(aC, aW, vec2(2.0, 1.0) - pp, dir, len2, lob, clp, lC);
    tap(aC, aW, vec2(2.0, 0.0) - pp, dir, len2, lob, clp, hC);
    tap(aC, aW, vec2(1.0, 0.0) - pp, dir, len2, lob, clp, gC);
    tap(aC, aW, vec2(1.0, 2.0) - pp, dir, len2, lob, clp, oC);
    tap(aC, aW, vec2(0.0, 2.0) - pp, dir, len2, lob, clp, nC);
    gl_FragColor = vec4(min(mx4, max(mn4, aC / aW)), 1.0);
  }`;

// RCAS: each pixel pushed away from its four neighbours, as far as it can go without clipping (con: 1 at full strength)
const RCAS = /* glsl */`
  uniform sampler2D tInput;
  uniform vec2 size;
  uniform float con;
  varying vec2 vUv;
  vec3 T(vec2 o) { return texture2D(tInput, vUv + o / size).rgb; }
  void main() {
    vec3 b = T(vec2(0, -1)), d = T(vec2(-1, 0)), e = T(vec2(0)), f = T(vec2(1, 0)), h = T(vec2(0, 1));
    vec3 mn4 = min(min(b, d), min(f, h)), mx4 = max(max(b, d), max(f, h));
    vec3 hitMin = min(mn4, e) / (4.0 * mx4 + 1e-5);
    vec3 hitMax = (1.0 - max(mx4, e)) / min(4.0 * mn4 - 4.0, -1e-5);
    vec3 lobeRGB = max(-hitMin, hitMax);
    float lobe = max(-(0.25 - 1.0 / 16.0), min(max(lobeRGB.r, max(lobeRGB.g, lobeRGB.b)), 0.0)) * con;
    gl_FragColor = vec4(clamp((lobe * (b + d + f + h) + e) / (4.0 * lobe + 1.0), 0.0, 1.0), 1.0);
  }`;

export class FSR {
  constructor(renderer) {
    this.r = renderer;
    const mat = (fragmentShader, uniforms) => new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader, depthTest: false, depthWrite: false });
    this.easu = new FullScreenQuad(mat(EASU, { tInput: { value: null }, inSize: { value: new THREE.Vector2() } }));
    this.rcas = new FullScreenQuad(mat(RCAS, { tInput: { value: null }, size: { value: new THREE.Vector2() }, con: { value: 1 } }));
    // the upsampled picture before sharpening: display values already (tone mapped, sRGB), so eight bits are enough
    this.mid = new THREE.WebGLRenderTarget(2, 2, { depthBuffer: false });
  }
  // src: the small picture, ready for display (tone mapped and in sRGB); drawn to the canvas at its own size. stops: how far the
  // sharpening is turned down (0 is full strength, each stop halves it)
  render(src, stops = 0.4) {
    const r = this.r, c = r.domElement, w = c.width, h = c.height;
    if (this.mid.width !== w || this.mid.height !== h) this.mid.setSize(w, h);
    const eu = this.easu.material.uniforms;
    eu.tInput.value = src.texture; eu.inSize.value.set(src.width, src.height);
    r.setRenderTarget(this.mid); this.easu.render(r);
    const ru = this.rcas.material.uniforms;
    ru.tInput.value = this.mid.texture; ru.size.value.set(w, h); ru.con.value = Math.pow(2, -stops);
    r.setRenderTarget(null); this.rcas.render(r);
  }
  dispose() { this.easu.dispose(); this.rcas.dispose(); this.easu.material.dispose(); this.rcas.material.dispose(); this.mid.dispose(); }
}
