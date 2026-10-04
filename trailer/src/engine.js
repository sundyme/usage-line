// The engine: shots render to HDR targets, a transition shader composites the two around a
// cut, bloom lifts the highlights, sub-frames accumulate into true motion blur, and a
// finishing pass grades, adds lens character and lays the HUD on top.
import * as THREE from 'three'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'

export const W = 1920
export const H = 1080
export const FPS = 60

export const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' })
renderer.setPixelRatio(1)
renderer.setSize(W, H)
renderer.toneMapping = THREE.NoToneMapping
// we clear by hand: the accumulation buffer must keep every sub-frame
renderer.autoClear = false
renderer.outputColorSpace = THREE.LinearSRGBColorSpace
document.body.appendChild(renderer.domElement)

const hdr = (samples = 0) =>
  new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples, depthBuffer: samples > 0, colorSpace: THREE.LinearSRGBColorSpace })
const shotRT = [hdr(4), hdr(4)]
const compRT = hdr()
const accumRT = hdr()

// only what glows (emissive above 1) blooms; white type stays crisp
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.55, 0.6, 0.93)

// ── math ─────────────────────────────────────────────────────────────────────────────────────
export const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x))
export const lerp = (a, b, p) => a + (b - a) * p
export const prog = (t, a, b) => clamp((t - a) / (b - a))
export const E = {
  lin: p => p,
  outCubic: p => 1 - (1 - p) ** 3,
  inCubic: p => p ** 3,
  inOutCubic: p => (p < 0.5 ? 4 * p ** 3 : 1 - (-2 * p + 2) ** 3 / 2),
  outQuart: p => 1 - (1 - p) ** 4,
  inOutQuart: p => (p < 0.5 ? 8 * p ** 4 : 1 - (-2 * p + 2) ** 4 / 2),
  outQuint: p => 1 - (1 - p) ** 5,
  inQuint: p => p ** 5,
  inOutQuint: p => (p < 0.5 ? 16 * p ** 5 : 1 - (-2 * p + 2) ** 5 / 2),
  outExpo: p => (p >= 1 ? 1 : 1 - 2 ** (-10 * p)),
  inExpo: p => (p <= 0 ? 0 : 2 ** (10 * p - 10)),
  inOutExpo: p => (p <= 0 ? 0 : p >= 1 ? 1 : p < 0.5 ? 2 ** (20 * p - 10) / 2 : (2 - 2 ** (-20 * p + 10)) / 2),
  inOutSine: p => -(Math.cos(Math.PI * p) - 1) / 2,
  outBack: p => 1 + 2.4 * (p - 1) ** 3 + 1.4 * (p - 1) ** 2,
  outElastic: p => (p <= 0 ? 0 : p >= 1 ? 1 : 2 ** (-10 * p) * Math.sin((p * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1),
}
export const tw = (t, a, b, ease = E.outCubic) => ease(prog(t, a, b))

// Keyframed values: [[t, v], [t, v, ease], ...], v a number or an array; each segment eases
// into its own key.
export function keys(t, ks) {
  const val = (a, b, p) => (Array.isArray(a) ? a.map((x, i) => lerp(x, b[i], p)) : lerp(a, b, p))
  if (t <= ks[0][0]) return ks[0][1]
  for (let i = 1; i < ks.length; i++) {
    const [t1, v1, ease = E.inOutCubic] = ks[i]
    const [t0, v0] = ks[i - 1]
    if (t <= t1) return val(v0, v1, ease(prog(t, t0, t1)))
  }
  return ks[ks.length - 1][1]
}

// Deterministic noise for handheld drift and shake.
export function noise1(x, seed = 0) {
  const h = n => {
    const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453
    return s - Math.floor(s)
  }
  const i = Math.floor(x)
  const f = x - i
  const u = f * f * (3 - 2 * f)
  return lerp(h(i), h(i + 1), u) * 2 - 1
}

export function rng(seed) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let r = Math.imul(s ^ (s >>> 15), 1 | s)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296
  }
}

// ── shots ────────────────────────────────────────────────────────────────────────────────────
export function makeShot() {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(40, W / H, 0.05, 400)
  return { scene, camera }
}

// Camera from position, look-at target, field of view and roll (degrees).
export function aim(camera, pos, target, fov, roll = 0) {
  camera.position.set(...pos)
  camera.up.set(Math.sin((roll * Math.PI) / 180), Math.cos((roll * Math.PI) / 180), 0)
  camera.lookAt(...target)
  if (camera.fov !== fov) {
    camera.fov = fov
    camera.updateProjectionMatrix()
  }
}

// Where a world point lands on screen, in uv (0..1, origin bottom-left).
export function project(camera, p) {
  const v = new THREE.Vector3(...p).project(camera)
  return [(v.x + 1) / 2, (v.y + 1) / 2, v.z]
}

// ── the transition compositor ──────────────────────────────────────────────────────────────
// kind: 0 A only · 1 cross · 2 iris (B inside a circle) · 3 zoom-through · 4 whip ·
//       5 light-line wipe · 6 flash
const comp = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: {
      tA: { value: null },
      tB: { value: null },
      kind: { value: 0 },
      p: { value: 0 },
      center: { value: new THREE.Vector2(0.5, 0.5) },
      radius: { value: 0 },
      dir: { value: new THREE.Vector2(1, 0) },
      tint: { value: new THREE.Color(0x4e8ff7) },
      aspect: { value: W / H },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tA, tB; uniform int kind; uniform float p, radius, aspect;
      uniform vec2 center, dir; uniform vec3 tint; varying vec2 vUv;
      vec3 zoomBlur(sampler2D t, vec2 uv, vec2 c, float amt){
        vec3 acc = vec3(0.); float w = 0.;
        for (int i = 0; i < 24; i++){ float k = float(i)/23.; vec2 q = c + (uv - c) * (1. - amt * k); acc += texture2D(t, q).rgb; w += 1.; }
        return acc / w;
      }
      vec3 dirBlur(sampler2D t, vec2 uv, vec2 d){
        vec3 acc = vec3(0.);
        for (int i = 0; i < 24; i++){ float k = float(i)/23. - .5; acc += texture2D(t, uv + d * k).rgb; }
        return acc / 24.;
      }
      void main(){
        vec2 uv = vUv;
        vec3 a = texture2D(tA, uv).rgb;
        if (kind == 0) { gl_FragColor = vec4(a, 1.); return; }
        if (kind == 1) { gl_FragColor = vec4(mix(a, texture2D(tB, uv).rgb, p), 1.); return; }
        if (kind == 2) {
          vec2 d = (uv - center) * vec2(aspect, 1.);
          float r = length(d);
          float m = smoothstep(radius + .004, radius - .004, r);
          float rim = exp(-pow((r - radius) / .006, 2.)) * smoothstep(0., .02, radius);
          vec3 b = texture2D(tB, uv).rgb;
          gl_FragColor = vec4(mix(a, b, m) + tint * rim * 2.5, 1.); return;
        }
        if (kind == 3) {
          // A rushes past (zoom blur outward), B arrives from slightly behind
          float ea = p, eb = 1. - p;
          vec2 ua = center + (uv - center) / (1. + ea * 2.2);
          vec3 A = zoomBlur(tA, ua, center, ea * .5);
          vec2 ub = center + (uv - center) * (1. + eb * .35);
          vec3 B = zoomBlur(tB, ub, center, eb * .35);
          float m = smoothstep(.35, .7, p);
          vec3 c = mix(A, B, m) + tint * .25 * exp(-pow((p - .5) / .12, 2.));
          gl_FragColor = vec4(c, 1.); return;
        }
        if (kind == 4) {
          // whip pan: both slide along dir with a heavy directional smear
          float e = p;
          float s = sin(e * 3.14159);
          vec2 ua = uv + dir * e;
          vec2 ub = uv - dir * (1. - e);
          vec3 A = dirBlur(tA, ua, dir * s * .45);
          vec3 B = dirBlur(tB, ub, dir * s * .45);
          float m = smoothstep(.45, .55, e);
          gl_FragColor = vec4(mix(A, B, m), 1.); return;
        }
        if (kind == 5) {
          // a line of light sweeps across; B is revealed behind it
          float x = dot(uv - .5, normalize(dir)) + .5;
          float edge = mix(-.08, 1.08, p);
          float m = smoothstep(edge + .003, edge - .003, x);
          vec3 b = texture2D(tB, uv).rgb;
          float glow = exp(-pow((x - edge) / .004, 2.)) * 3. + exp(-abs(x - edge) / .05) * .5;
          gl_FragColor = vec4(mix(a, b, m) + tint * glow, 1.); return;
        }
        if (kind == 6) {
          float f = exp(-pow((p - .5) / .16, 2.));
          vec3 b = texture2D(tB, uv).rgb;
          gl_FragColor = vec4(mix(a, b, smoothstep(.45, .55, p)) + vec3(f * 1.6), 1.); return;
        }
        gl_FragColor = vec4(a, 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  }),
)

const accum = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, w: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `uniform sampler2D t; uniform float w; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(t, vUv).rgb * w, 1.); }`,
    blending: THREE.AdditiveBlending,
    depthTest: false,
    depthWrite: false,
    transparent: true,
  }),
)

const hudCanvas = document.createElement('canvas')
hudCanvas.width = W
hudCanvas.height = H
export const hud = hudCanvas.getContext('2d')
const hudTex = new THREE.CanvasTexture(hudCanvas)
hudTex.colorSpace = THREE.SRGBColorSpace
hudTex.flipY = true
hudTex.premultiplyAlpha = true

const finish = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: {
      t: { value: accumRT.texture },
      hud: { value: hudTex },
      ca: { value: 0 },
      exposure: { value: 1 },
      fade: { value: 1 },
      seed: { value: 0 },
      aspect: { value: W / H },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D t, hud; uniform float ca, exposure, fade, seed, aspect; varying vec2 vUv;
      vec3 roll(vec3 c){ // keep everything below .8 exact; roll the bloom's highlights off softly
        return mix(c, .8 + .2 * (1. - exp(-(c - .8) * 3.)), step(.8, c));
      }
      vec3 srgb(vec3 c){ c = max(c, 0.); return mix(c * 12.92, 1.055 * pow(c, vec3(1. / 2.4)) - .055, step(.0031308, c)); }
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + seed) * 43758.5453); }
      void main(){
        vec2 d = vUv - .5;
        float r2 = dot(d * vec2(aspect, 1.), d * vec2(aspect, 1.));
        vec2 off = d * ca * (.4 + r2);
        vec3 c;
        c.r = texture2D(t, vUv + off).r;
        c.g = texture2D(t, vUv).g;
        c.b = texture2D(t, vUv - off).b;
        c *= exposure;
        c = roll(c);
        c *= 1. - .38 * smoothstep(.15, 1.1, r2);   // vignette
        vec3 s = srgb(c);
        vec4 h = texture2D(hud, vUv);
        s = s * (1. - h.a) + h.rgb;                   // HUD, premultiplied
        s *= fade;
        s += (hash(vUv * 1000.) - .5) * .012;          // a whisper of dither
        gl_FragColor = vec4(s, 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  }),
)

// Render one output frame: `sample(t)` returns { shots: [{shot, rt index}], transition } for a
// sub-frame time; we accumulate SAMPLES of them across a 180° shutter.
export function renderFrame(frame, { samples, shutter = 0.5, plan, drawHud, look }) {
  renderer.setRenderTarget(accumRT)
  renderer.setClearColor(0x000000, 1)
  renderer.clear()
  for (let s = 0; s < samples; s++) {
    const t = Math.max(0, (frame + ((s + 0.5) / samples - 0.5) * shutter) / FPS)
    const { a, b, kind = 0, p = 0, center = [0.5, 0.5], radius = 0, dir = [1, 0], bloomStrength } = plan(t)
    renderer.setClearColor(0x000000, 1)
    renderer.setRenderTarget(shotRT[0])
    renderer.clear()
    a.update(t)
    renderer.render(a.scene, a.camera)
    const u = comp.material.uniforms
    u.tA.value = shotRT[0].texture
    u.kind.value = 0
    if (b && kind) {
      renderer.setRenderTarget(shotRT[1])
      renderer.clear()
      b.update(t)
      renderer.render(b.scene, b.camera)
      u.tB.value = shotRT[1].texture
      u.kind.value = kind
      u.p.value = p
      u.center.value.set(...center)
      u.radius.value = radius
      u.dir.value.set(...dir)
    }
    renderer.setRenderTarget(compRT)
    comp.render(renderer)
    bloom.strength = bloomStrength ?? 0.55
    bloom.render(renderer, null, compRT, 0, false)
    accum.material.uniforms.t.value = compRT.texture
    accum.material.uniforms.w.value = 1 / samples
    renderer.setRenderTarget(accumRT)
    accum.render(renderer)
  }
  const tm = frame / FPS
  hud.clearRect(0, 0, W, H)
  drawHud(hud, tm, frame)
  hudTex.needsUpdate = true
  const L = look(tm)
  const f = finish.material.uniforms
  f.ca.value = L.ca ?? 0.004
  f.exposure.value = L.exposure ?? 1
  f.fade.value = L.fade ?? 1
  f.seed.value = (frame % 97) * 1.37
  renderer.setRenderTarget(null)
  finish.render(renderer)
  const gl = renderer.getContext()
  const px = new Uint8Array(W * H * 4)
  gl.readPixels(0, 0, W, H, gl.RGBA, gl.UNSIGNED_BYTE, px)
  return px
}
