// The film's kit: the pieces every shot is built from. Gradient-mesh grounds, a screen-locked
// type layer (redrawn per sub-frame, so type gets real motion blur), kinetic type, glass,
// light streaks, shockwaves and sparks.
import * as THREE from 'three'
import { E, H, W, aim, clamp, lerp, noise1, prog, rng } from './engine.js'
import { F, FG, TAU, canvasTexture, measure, rgba, text } from './ui.js'

export const UNIT = 100 // pixels per world unit on the z = 0 plane at the reference distance
// distance at which the z = 0 plane maps 1:1 to the frame for a vertical fov
export const dist = fov => H / 2 / UNIT / Math.tan((fov * Math.PI) / 360)

// ── planes you draw on ──────────────────────────────────────────────────────────────────────
export function panel(pxW, pxH, { res = 2, intensity = 1, side = THREE.DoubleSide, blending = THREE.NormalBlending } = {}) {
  const ct = canvasTexture(Math.round(pxW * res), Math.round(pxH * res))
  const mat = new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, depthWrite: false, depthTest: false, toneMapped: false, side, blending })
  mat.color.setScalar(intensity)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pxW / UNIT, pxH / UNIT), mat)
  mesh.userData.draw = (key, fn) =>
    ct.draw(key, ctx => {
      ctx.scale(res, res)
      fn(ctx)
    })
  mesh.userData.w = pxW
  mesh.userData.h = pxH
  return mesh
}

const glowTex = (() => {
  const ct = canvasTexture(256, 256)
  ct.draw(0, ctx => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.22, 'rgba(255,255,255,0.5)')
    g.addColorStop(0.55, 'rgba(255,255,255,0.12)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  })
  return ct.tex
})()
export function glow(size, color, intensity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }),
  )
  m.userData.set = (c, k) => m.material.color.set(c).multiplyScalar(k)
  return m
}

// ── the ground: a slow gradient mesh, drawn straight into clip space ──────────────────────────
// blobs: [{ c, x, y, r, a, ph }] in frame units (x 0..1 left→right, y 0..1 bottom→top)
export function ground(scene, { base = '#07080d', blobs = [], light = false, warp = 0.05 } = {}) {
  const N = 6
  const uni = {
    base: { value: new THREE.Color(base) },
    cols: { value: Array.from({ length: N }, () => new THREE.Color(0)) },
    pos: { value: Array.from({ length: N }, () => new THREE.Vector3(0.5, 0.5, 0.3)) },
    amt: { value: new Array(N).fill(0) },
    light: { value: light ? 1 : 0 },
    time: { value: 0 },
    warp: { value: warp },
    aspect: { value: W / H },
    fade: { value: 1 },
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: uni,
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, .9999, 1.); }`,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform vec3 base; uniform vec3 cols[${N}]; uniform vec3 pos[${N}]; uniform float amt[${N}];
        uniform float light, time, warp, aspect, fade; varying vec2 vUv;
        void main(){
          vec2 q = vec2(vUv.x * aspect, vUv.y);
          q += warp * vec2(sin(q.y * 2.3 + time * .35), cos(q.x * 1.9 - time * .28));
          vec3 c = base;
          for (int i = 0; i < ${N}; i++) {
            vec2 d = q - vec2(pos[i].x * aspect, pos[i].y);
            float w = exp(-dot(d, d) / (pos[i].z * pos[i].z)) * amt[i];
            if (light > .5) c = mix(c, cols[i], clamp(w, 0., 1.)); else c += cols[i] * w;
          }
          gl_FragColor = vec4(c * fade, 1.);
        }`,
      depthTest: false,
      depthWrite: false,
    }),
  )
  mesh.frustumCulled = false
  mesh.renderOrder = -1000
  scene.add(mesh)
  let list = blobs
  mesh.userData.set = (b, baseColor) => {
    list = b
    if (baseColor) uni.base.value.set(baseColor)
  }
  mesh.userData.tick = (t, k = 1) => {
    uni.time.value = t
    for (let i = 0; i < N; i++) {
      const b = list[i]
      if (!b) {
        uni.amt.value[i] = 0
        continue
      }
      const ph = b.ph ?? i * 1.7
      uni.cols.value[i].set(b.c)
      uni.pos.value[i].set(b.x + 0.07 * Math.sin(t * 0.31 + ph), b.y + 0.06 * Math.cos(t * 0.27 + ph * 1.3), b.r)
      uni.amt.value[i] = (b.a ?? 1) * k
    }
  }
  mesh.userData.uni = uni
  return mesh
}

// ── the type layer: a full-frame canvas locked to the screen ────────────────────────────────
// Drawn in sRGB like any canvas, premultiplied; converted to linear light here.
export function typeLayer(scene) {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = THREE.NoColorSpace
  tex.generateMipmaps = false
  tex.minFilter = THREE.LinearFilter
  tex.magFilter = THREE.LinearFilter
  tex.premultiplyAlpha = true
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(2, 2),
    new THREE.ShaderMaterial({
      uniforms: { t: { value: tex }, gain: { value: 1 } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
      fragmentShader: /* glsl */ `
        uniform sampler2D t; uniform float gain; varying vec2 vUv;
        vec3 lin(vec3 c){ return mix(c / 12.92, pow((c + .055) / 1.055, vec3(2.4)), step(.04045, c)); }
        void main(){
          vec4 s = texture2D(t, vUv);
          if (s.a < .001) discard;
          vec3 c = lin(s.rgb / s.a) * s.a * gain;
          gl_FragColor = vec4(c, s.a);
        }`,
      transparent: true,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      depthTest: false,
      depthWrite: false,
    }),
  )
  mesh.frustumCulled = false
  mesh.renderOrder = 1000
  scene.add(mesh)
  let empty = true
  return {
    mesh,
    ctx,
    // fn draws for time t and returns false when it drew nothing
    draw(fn) {
      ctx.setTransform(1, 0, 0, 1, 0, 0)
      ctx.globalAlpha = 1
      ctx.filter = 'none'
      if (!empty) ctx.clearRect(0, 0, W, H)
      const drew = fn(ctx) !== false
      if (drew || !empty) tex.needsUpdate = true
      empty = !drew
      mesh.visible = drew
    },
  }
}

// ── kinetic type ────────────────────────────────────────────────────────────────────────────
// One line, glyph by glyph. style: rise · drop · pop · type. accent: [from, to, [c0, c1]]
// colours a run of glyphs with a gradient. Out: glyphs lift and blur away from t1.
const fontPx = font => Number(/(\d+(?:\.\d+)?)px/.exec(font)[1])
export function kin(ctx, str, x, y, font, t, o = {}) {
  const {
    t0 = 0, t1 = 1e9, style = 'rise', color = FG, accent = null, align = 'center', stagger = 0.032, dur = 0.6,
    outDur = 0.32, tracking = 0, caret = null, caretColor = '#4e8ff7', alpha = 1, rise = 0.5, outRise = 0.42, blurK = 16,
  } = o
  if (t < t0 || alpha <= 0.001) return null
  const size = fontPx(font)
  ctx.font = font
  const chars = [...str]
  const widths = chars.map(c => ctx.measureText(c).width + tracking)
  const total = widths.reduce((a, b) => a + b, 0) - tracking
  let x0 = align === 'center' ? x - total / 2 : align === 'right' ? x - total : x
  const xs = []
  let cx = x0
  for (const w of widths) {
    xs.push(cx)
    cx += w
  }
  let grad = null
  if (accent) {
    const [a, b, [c0, c1]] = accent
    grad = [xs[a], xs[Math.min(b, chars.length) - 1] + widths[Math.min(b, chars.length) - 1], c0, c1]
  }
  let shown = chars.length
  if (style === 'type') shown = Math.max(0, Math.min(chars.length, Math.floor((t - t0) / stagger) + 1))
  const n = chars.length
  let lastX = x0
  for (let i = 0; i < shown; i++) {
    const c = chars[i]
    const local = t - t0 - i * stagger
    const p = clamp(local / dur)
    const out = clamp((t - t1 - i * stagger * 0.45) / outDur)
    if (out >= 1) continue
    let dy = 0
    let rot = 0
    let sc = 1
    let a = 1
    let blur = 0
    if (style === 'rise') {
      const q = E.outExpo(p)
      dy = (1 - q) * rise * size
      blur = (1 - q) * blurK
      a = clamp(p * 2.4)
    } else if (style === 'drop') {
      const q = E.outBack(p)
      dy = -(1 - q) * 0.95 * size
      rot = (1 - E.outCubic(p)) * (i % 2 ? 0.32 : -0.28)
      blur = (1 - clamp(p * 1.6)) * 8
      a = clamp(p * 4)
    } else if (style === 'pop') {
      const q = E.outExpo(p)
      sc = lerp(1.7, 1, q)
      blur = (1 - q) * 18
      a = clamp(p * 3)
    } else if (style === 'type') {
      const q = E.outCubic(clamp(local / 0.12))
      dy = (1 - q) * 0.1 * size
      a = clamp(local / 0.05)
    }
    if (out > 0) {
      dy -= E.inCubic(out) * outRise * size
      blur += out * 14
      a *= 1 - E.inQuad(out)
    }
    a *= alpha
    if (a <= 0.002) continue
    const w = widths[i] - tracking
    const mx = xs[i] + w / 2
    ctx.save()
    ctx.globalAlpha = a
    if (blur > 0.4) ctx.filter = `blur(${blur.toFixed(1)}px)`
    ctx.translate(mx, y + dy)
    if (rot) ctx.rotate(rot)
    if (sc !== 1) ctx.scale(sc, sc)
    let fill = color
    if (grad && i >= accent[0] && i < accent[1]) {
      const g = ctx.createLinearGradient(grad[0] - mx, 0, grad[1] - mx, 0)
      g.addColorStop(0, grad[2])
      g.addColorStop(1, grad[3])
      fill = g
    }
    if (style === 'type' && accent?.[3]) {
      // a fresh glyph lands in the accent colour and cools to its own
      const k = clamp(local / 0.28)
      if (k < 1) {
        ctx.fillStyle = accent[3]
        ctx.globalAlpha = a * (1 - k)
        ctx.font = font
        ctx.fillText(c, -w / 2, 0)
        ctx.globalAlpha = a * k
      }
    }
    ctx.fillStyle = fill
    ctx.font = font
    ctx.fillText(c, -w / 2, 0)
    ctx.restore()
    lastX = xs[i] + w
  }
  if (caret) {
    const on = caret === 'solid' || shown < n || Math.floor(t * 2) % 2 === 0
    const ca = alpha * (1 - clamp((t - t1) / outDur))
    if (on && ca > 0) {
      ctx.save()
      ctx.globalAlpha = ca
      ctx.fillStyle = caretColor
      const cw = Math.max(4, size * 0.085)
      const gap = size * 0.08
      roundRectPath(ctx, (shown ? lastX : x0) + gap, y - size * 0.86, cw, size * 1.06, cw / 2)
      ctx.fill()
      ctx.restore()
    }
  }
  return { x0, width: total, end: lastX }
}

export function roundRectPath(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

// ── glass ───────────────────────────────────────────────────────────────────────────────────
export function glass(ctx, x, y, w, h, r, { fill = 0.07, border = 0.16, tint = '#ffffff', shadow = 0.5, top = 0.1, base = null } = {}) {
  if (shadow > 0) {
    ctx.save()
    ctx.shadowColor = `rgba(0,0,0,${shadow})`
    ctx.shadowBlur = 60
    ctx.shadowOffsetY = 24
    roundRectPath(ctx, x, y, w, h, r)
    ctx.fillStyle = base ?? 'rgba(10,10,14,0.55)'
    ctx.fill()
    ctx.restore()
  } else if (base) {
    roundRectPath(ctx, x, y, w, h, r)
    ctx.fillStyle = base
    ctx.fill()
  }
  roundRectPath(ctx, x, y, w, h, r)
  const g = ctx.createLinearGradient(x, y, x, y + h)
  g.addColorStop(0, rgba(tint, fill + top))
  g.addColorStop(0.45, rgba(tint, fill))
  g.addColorStop(1, rgba(tint, fill * 0.6))
  ctx.fillStyle = g
  ctx.fill()
  ctx.lineWidth = 2
  const b = ctx.createLinearGradient(x, y, x + w * 0.3, y + h)
  b.addColorStop(0, rgba(tint, border * 1.6))
  b.addColorStop(0.5, rgba(tint, border * 0.6))
  b.addColorStop(1, rgba(tint, border))
  ctx.strokeStyle = b
  roundRectPath(ctx, x + 1, y + 1, w - 2, h - 2, r - 1)
  ctx.stroke()
}

// The pointer.
export function cursor(ctx, x, y, s = 1, alpha = 1) {
  if (alpha <= 0) return
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.translate(x, y)
  ctx.scale(s, s)
  ctx.beginPath()
  ctx.moveTo(0, 0)
  ctx.lineTo(0, 34)
  ctx.lineTo(8.5, 26)
  ctx.lineTo(14, 39)
  ctx.lineTo(20, 36.5)
  ctx.lineTo(14.5, 24)
  ctx.lineTo(25, 24)
  ctx.closePath()
  ctx.shadowColor = 'rgba(0,0,0,0.45)'
  ctx.shadowBlur = 10
  ctx.shadowOffsetY = 3
  ctx.fillStyle = '#fff'
  ctx.fill()
  ctx.shadowColor = 'transparent'
  ctx.lineWidth = 2
  ctx.strokeStyle = '#111'
  ctx.stroke()
  ctx.restore()
}

// ── light: streaks, a shockwave, sparks ───────────────────────────────────────────────────────
// Hyperspace: lines rushing at the camera down the −z axis. speed(t) in units/s, integrated by
// the caller as `travel`.
export function streaks({ count = 900, radius = [1.2, 16], depth = 120, len = 2.5, colors = ['#9ab8ff', '#c4b5fd', '#7dd3fc'], seed = 3, intensity = 2.2 } = {}) {
  const r = rng(seed)
  const pos = new Float32Array(count * 2 * 3)
  const end = new Float32Array(count * 2)
  const col = new Float32Array(count * 2 * 3)
  const off = new Float32Array(count * 2)
  for (let i = 0; i < count; i++) {
    const a = r() * TAU
    const rad = lerp(radius[0], radius[1], Math.sqrt(r()))
    const c = new THREE.Color(colors[Math.floor(r() * colors.length)])
    for (let k = 0; k < 2; k++) {
      const j = i * 2 + k
      pos[j * 3] = Math.cos(a) * rad
      pos[j * 3 + 1] = Math.sin(a) * rad
      pos[j * 3 + 2] = 0
      end[j] = k
      off[j] = r()
      col[j * 3] = c.r
      col[j * 3 + 1] = c.g
      col[j * 3 + 2] = c.b
    }
    off[i * 2 + 1] = off[i * 2]
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('end', new THREE.BufferAttribute(end, 1))
  g.setAttribute('off', new THREE.BufferAttribute(off, 1))
  g.setAttribute('col', new THREE.BufferAttribute(col, 3))
  const mat = new THREE.ShaderMaterial({
    uniforms: { travel: { value: 0 }, depth: { value: depth }, len: { value: len }, stretch: { value: 1 }, gain: { value: intensity }, opacity: { value: 1 }, camZ: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float travel, depth, len, stretch, camZ; attribute float end, off; attribute vec3 col; varying vec3 vC; varying float vA;
      void main(){
        float z = camZ - mod(off * depth - travel, depth) - 1.;
        z -= end * len * stretch;
        vec3 p = vec3(position.xy, z);
        vC = col; vA = (1. - end) * smoothstep(-depth, -depth * .6, z - camZ);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.);
      }`,
    fragmentShader: `uniform float gain, opacity; varying vec3 vC; varying float vA; void main(){ gl_FragColor = vec4(vC * gain * vA * opacity, 1.); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  })
  const lines = new THREE.LineSegments(g, mat)
  lines.frustumCulled = false
  lines.userData.u = mat.uniforms
  return lines
}

// A ring of light that expands and thins: a flat additive plane.
const waveTex = (() => {
  const ct = canvasTexture(512, 512)
  ct.draw(0, ctx => {
    const g = ctx.createRadialGradient(256, 256, 200, 256, 256, 256)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.72, 'rgba(255,255,255,0.15)')
    g.addColorStop(0.9, 'rgba(255,255,255,1)')
    g.addColorStop(0.95, 'rgba(255,255,255,0.35)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 512)
  })
  return ct.tex
})()
export function shockwave(color = '#9ec5ff', intensity = 2.5) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: waveTex, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, toneMapped: false }),
  )
  m.visible = false
  // fire at t0, reach radius R over dur
  m.userData.at = (t, t0, R = 6, dur = 0.7, k = intensity) => {
    const p = (t - t0) / dur
    if (p < 0 || p > 1) {
      m.visible = false
      return
    }
    m.visible = true
    const s = lerp(0.2, R * 2, E.outCubic(p))
    m.scale.set(s, s, 1)
    m.material.color.set(color).multiplyScalar(k * (1 - p) ** 1.5)
  }
  return m
}

// Sparks: points thrown out from a centre with drag, fading.
export function sparks({ count = 160, color = '#bcd6ff', speed = [2, 9], seed = 9, size = 0.06, intensity = 3, spread3d = 0.4 } = {}) {
  const r = rng(seed)
  const vel = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    const a = r() * TAU
    const s = lerp(speed[0], speed[1], r() ** 1.5)
    vel[i * 3] = Math.cos(a) * s
    vel[i * 3 + 1] = Math.sin(a) * s
    vel[i * 3 + 2] = (r() - 0.5) * s * spread3d
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3))
  g.setAttribute('vel', new THREE.BufferAttribute(vel, 3))
  const mat = new THREE.ShaderMaterial({
    uniforms: { age: { value: 0 }, size: { value: size }, scale: { value: 1 }, color: { value: new THREE.Color(color).multiplyScalar(intensity) }, fade: { value: 0 } },
    vertexShader: /* glsl */ `
      uniform float age, size, scale; attribute vec3 vel;
      void main(){
        float d = (1. - exp(-age * 3.2)) / 3.2;
        vec3 p = vel * d;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1., size * scale / -mv.z);
      }`,
    fragmentShader: `uniform vec3 color; uniform float fade; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(color * smoothstep(.5, 0., d) * fade, 1.); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  })
  const pts = new THREE.Points(g, mat)
  pts.frustumCulled = false
  pts.visible = false
  pts.userData.at = (t, t0, camera, life = 1.1) => {
    const age = t - t0
    if (age < 0 || age > life) {
      pts.visible = false
      return
    }
    pts.visible = true
    mat.uniforms.age.value = age
    mat.uniforms.fade.value = (1 - age / life) ** 1.6
    mat.uniforms.scale.value = H / 2 / Math.tan((camera.fov * Math.PI) / 360)
  }
  return pts
}

// Dust: slow motes for depth.
export function dust({ count = 500, box = [30, 18, 20], center = [0, 0, -4], size = 0.05, color = '#a5b8ff', seed = 1, opacity = 0.5 } = {}) {
  const r = rng(seed)
  const pos = new Float32Array(count * 3)
  const ph = new Float32Array(count)
  for (let i = 0; i < count; i++) {
    pos[i * 3] = center[0] + (r() - 0.5) * box[0]
    pos[i * 3 + 1] = center[1] + (r() - 0.5) * box[1]
    pos[i * 3 + 2] = center[2] + (r() - 0.5) * box[2]
    ph[i] = r() * 100
  }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1))
  const mat = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, size: { value: size }, scale: { value: 1 }, color: { value: new THREE.Color(color) }, opacity: { value: opacity } },
    vertexShader: `
      uniform float time, size, scale; attribute float phase; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(time * .3 + phase), cos(time * .25 + phase * 1.7), 0.) * .25 + vec3(0., time * .05, 0.);
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1., size * scale / -mv.z);
        vA = .35 + .65 * fract(phase * 7.13);
      }`,
    fragmentShader: `uniform vec3 color; uniform float opacity; varying float vA; void main(){ float d = length(gl_PointCoord - .5); gl_FragColor = vec4(color * smoothstep(.5, 0., d) * vA * opacity, 1.); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    depthTest: false,
    transparent: true,
  })
  const pts = new THREE.Points(g, mat)
  pts.frustumCulled = false
  pts.userData.tick = (t, camera, k = 1) => {
    mat.uniforms.time.value = t
    mat.uniforms.opacity.value = opacity * k
    mat.uniforms.scale.value = H / 2 / Math.tan((camera.fov * Math.PI) / 360)
  }
  return pts
}

// ── the camera ──────────────────────────────────────────────────────────────────────────────
// Always a little alive: a slow handheld drift, plus optional shake.
export function shoot(camera, t, pos, tgt, fov, { drift = 0.05, shake = 0, roll = 0 } = {}) {
  const n = (k, s) => noise1(t * s, k)
  const p = [pos[0] + n(1, 0.33) * drift + n(7, 23) * shake, pos[1] + n(2, 0.29) * drift + n(8, 21) * shake, pos[2] + n(3, 0.25) * drift * 0.4]
  const q = [tgt[0] + n(4, 0.31) * drift * 0.5 + n(9, 19) * shake * 0.5, tgt[1] + n(5, 0.27) * drift * 0.5, tgt[2]]
  aim(camera, p, q, fov, roll + n(6, 0.2) * 0.35)
}

// Where a world point lands, in frame pixels (y down).
export function toPx(camera, p) {
  const v = new THREE.Vector3(...p).project(camera)
  return [((v.x + 1) / 2) * W, ((1 - v.y) / 2) * H]
}

export { text, measure, F, prog }
