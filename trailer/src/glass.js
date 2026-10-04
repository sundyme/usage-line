// Liquid glass. A glass shot renders in three passes: the world behind (layer 0) into its own
// target and a blurred copy; then the glass (layer 1), which bends that world through a
// rounded bevel, splits it a little at the rim, frosts it, tints it and catches the light on
// its edge; then whatever sits on the glass (layer 2).
import * as THREE from 'three'
import { FullScreenQuad } from 'three/addons/postprocessing/Pass.js'
import { H, W, clamp } from './engine.js'
import { UNIT, panel } from './kit.js'

export const BACK = 0
export const GLASS = 1
export const FRONT = 2

const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, colorSpace: THREE.LinearSRGBColorSpace })
export const backRT = rt(W, H)
const halfA = rt(W / 2, H / 2)
export const halfB = rt(W / 2, H / 2)
const quarterA = rt(W / 4, H / 4)
export const quarterB = rt(W / 4, H / 4)

const blurPass = new FullScreenQuad(
  new THREE.ShaderMaterial({
    uniforms: { t: { value: null }, dir: { value: new THREE.Vector2() } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D t; uniform vec2 dir; varying vec2 vUv;
      void main(){
        vec3 c = texture2D(t, vUv).rgb * .1964825501511404;
        c += texture2D(t, vUv + dir * 1.411764705882353).rgb * .2969069646728344;
        c += texture2D(t, vUv - dir * 1.411764705882353).rgb * .2969069646728344;
        c += texture2D(t, vUv + dir * 3.2941176470588234).rgb * .09447039785044732;
        c += texture2D(t, vUv - dir * 3.2941176470588234).rgb * .09447039785044732;
        c += texture2D(t, vUv + dir * 5.176470588235294).rgb * .010381362401148057;
        c += texture2D(t, vUv - dir * 5.176470588235294).rgb * .010381362401148057;
        gl_FragColor = vec4(c, 1.);
      }`,
    depthTest: false,
    depthWrite: false,
  }),
)
function blur(renderer, src, a, b, px) {
  const u = blurPass.material.uniforms
  u.t.value = src.texture
  u.dir.value.set(px / src.width, 0)
  renderer.setRenderTarget(a)
  blurPass.render(renderer)
  u.t.value = a.texture
  u.dir.value.set(0, px / a.height)
  renderer.setRenderTarget(b)
  blurPass.render(renderer)
}

// The render function a glass shot hands the engine.
export function glassRender(shot) {
  return (renderer, target) => {
    const cam = shot.camera
    cam.layers.set(BACK)
    renderer.setRenderTarget(backRT)
    renderer.setClearColor(0x000000, 1)
    renderer.clear()
    renderer.render(shot.scene, cam)
    // two strengths of frost: half-res and quarter-res gaussians
    blur(renderer, backRT, halfA, halfB, 1.2)
    blur(renderer, halfB, halfA, halfB, 1.6)
    blur(renderer, halfB, quarterA, quarterB, 1.6)
    blur(renderer, quarterB, quarterA, quarterB, 2.2)
    blur(renderer, quarterB, quarterA, quarterB, 3.0)
    renderer.setRenderTarget(target)
    renderer.render(shot.scene, cam)
    cam.layers.set(GLASS)
    renderer.render(shot.scene, cam)
    cam.layers.set(FRONT)
    renderer.render(shot.scene, cam)
    cam.layers.set(BACK)
  }
}

// Put an object (and its children) on a layer.
export function onLayer(obj, layer) {
  obj.traverse(o => o.layers.set(layer))
  return obj
}

// ── the glass itself ─────────────────────────────────────────────────────────────────────────
// A unit plane scaled to w × h px; the shader works in those pixels so the shape can morph.
export function glassShape({ w = 400, h = 120, r = 60, tint = '#1a1b22', tintA = 0.34, frost = 0.72, refr = 28, bevel = 24, disp = 0.4, rim = 1.25, mag = 0.06, opacity = 1 } = {}) {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      tBack: { value: backRT.texture },
      tHalf: { value: halfB.texture },
      tQuarter: { value: quarterB.texture },
      res: { value: new THREE.Vector2(W, H) },
      size: { value: new THREE.Vector2(w, h) },
      radius: { value: r },
      tint: { value: new THREE.Color(tint) },
      tintA: { value: tintA },
      frost: { value: frost },
      refr: { value: refr },
      bevel: { value: bevel },
      disp: { value: disp },
      rimK: { value: rim },
      mag: { value: mag },
      opacity: { value: opacity },
      glowC: { value: new THREE.Color(0x000000) },
      time: { value: 0 },
    },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform sampler2D tBack, tHalf, tQuarter; uniform vec2 res, size; uniform float radius, tintA, frost, refr, bevel, disp, rimK, mag, opacity, time;
      uniform vec3 tint, glowC; varying vec2 vUv;
      float sdr(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return min(max(q.x, q.y), 0.) + length(max(q, 0.)) - r; }
      vec3 bg(vec2 u, float f){
        u = clamp(u, vec2(.001), vec2(.999));
        vec3 s = texture2D(tBack, u).rgb, a = texture2D(tHalf, u).rgb, b = texture2D(tQuarter, u).rgb;
        return f < .5 ? mix(s, a, f * 2.) : mix(a, b, f * 2. - 1.);
      }
      void main(){
        vec2 p = (vUv - .5) * size;
        float r = min(radius, min(size.x, size.y) * .5);
        vec2 b = size * .5;
        float d = sdr(p, b, r);
        if (d > 1.) discard;
        float aa = clamp(.5 - d, 0., 1.);
        float e = .75;
        vec2 g = vec2(sdr(p + vec2(e, 0.), b, r) - sdr(p - vec2(e, 0.), b, r), sdr(p + vec2(0., e), b, r) - sdr(p - vec2(0., e), b, r));
        g = normalize(g + 1e-6);
        // a rounded bevel: steep at the rim, flat inside
        float T = min(bevel, min(size.x, size.y) * .45);
        float x = clamp(-d / T, 0., 1.);
        float k = 1. - x;
        float slope = k / sqrt(max(.02, 1. - k * k));
        vec2 su = gl_FragCoord.xy / res;
        vec2 off = -g * slope * refr / res;          // bend the world inward at the rim
        off -= (p / max(size.x, size.y)) * mag * (size / res); // and magnify it a touch inside
        float fr = frost * (1. - .5 * k);
        vec3 c;
        c.r = bg(su + off * (1. + disp), fr).r;
        c.g = bg(su + off, fr).g;
        c.b = bg(su + off * (1. - disp), fr).b;
        // smoke
        c = mix(c, tint, tintA);
        // light: from the top left
        vec2 L = normalize(vec2(-.55, .85));
        float facing = clamp(.5 + .5 * dot(g, L), 0., 1.);
        float back = clamp(.5 + .5 * dot(g, -L), 0., 1.);
        float rq = (d + 1.2) / 1.1;
        float rim = exp(-rq * rq);
        float ang = atan(g.y, g.x) / 6.2831853;
        vec3 prism = .55 + .45 * cos(6.2831853 * (ang * 1.0 + vec3(0., .33, .67)) + time * .25);
        c += rim * mix(vec3(1.), prism, .6) * (.18 + 1.1 * pow(facing, 4.) + .5 * pow(back, 6.)) * rimK;
        // the inner bevel catches a softer band of light
        float band = smoothstep(0., .35, k) * smoothstep(1., .55, k);
        c += band * (.10 * pow(facing, 2.) + .04) * rimK;
        c -= band * .06 * pow(back, 2.);
        // a faint sheen across the top
        c += vec3(.035) * smoothstep(-b.y * .2, b.y, p.y) * rimK;
        c += glowC * (1. - x * .6);
        c = max(c, 0.);
        if (any(isnan(c)) || any(isinf(c))) c = vec3(0.);
        gl_FragColor = vec4(c, aa * opacity);
      }`,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  })
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  mesh.layers.set(GLASS)
  mesh.renderOrder = 50
  const u = mat.uniforms
  mesh.userData.u = u
  mesh.userData.set = (nw, nh, nr = u.radius.value) => {
    u.size.value.set(Math.max(1, nw), Math.max(1, nh))
    u.radius.value = nr
    mesh.scale.set(Math.max(1, nw) / UNIT, Math.max(1, nh) / UNIT, 1)
  }
  mesh.userData.tick = t => (u.time.value = t)
  mesh.userData.set(w, h, r)
  return mesh
}

// A soft shadow under a glass shape, on the world behind it.
export function glassShadow(w, h, r, { k = 0.55, spread = 40, dy = 26 } = {}) {
  const pad = spread * 2
  const p = panel(w + pad * 2, h + pad * 2, { res: 0.5 })
  p.userData.draw(0, ctx => {
    ctx.shadowColor = `rgba(0,0,0,${k})`
    ctx.shadowBlur = spread
    ctx.shadowOffsetY = dy
    ctx.beginPath()
    ctx.roundRect(pad, pad, w, h, r)
    ctx.fillStyle = `rgba(0,0,0,${k * 0.6})`
    ctx.fill()
  })
  p.renderOrder = 3
  return p
}

// A panel that sits on the glass.
export function onGlass(pxW, pxH, opts = {}) {
  const p = panel(pxW, pxH, { res: 2, ...opts })
  p.layers.set(FRONT)
  p.renderOrder = 60
  return p
}

export { clamp }
