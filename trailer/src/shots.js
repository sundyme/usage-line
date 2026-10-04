// The eight shots. Each is its own scene and camera, updated from the clock alone.
import * as THREE from 'three'
import { E, W, H, aim, clamp, keys, lerp, makeShot, noise1, prog, project, rng, tw } from './engine.js'
import { BEAT, CUTS, DROPS, GROOVE, SHOTS } from './timeline.js'
import {
  AMBER, BG, BLUE, DIM, F, FAINT, FG, GREY, RED, SURFACE, SURFACE2, TAU,
  canvasTexture, check, clockText, drawRow, glowSpot, measure, mix, pie, reveal, rgba, ring, ringColor, rowItems, rowLayout, roundRect, span, text, typed,
} from './ui.js'

const UNIT = 100 // texture pixels per world unit

// ── building blocks ─────────────────────────────────────────────────────────────────────────
// A plane showing a canvas you draw on in logical pixels (drawn at `res`× for crispness).
function panel(pxW, pxH, { res = 2, intensity = 1, side = THREE.DoubleSide } = {}) {
  const ct = canvasTexture(Math.round(pxW * res), Math.round(pxH * res))
  const mat = new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, depthWrite: false, toneMapped: false, side })
  mat.color.setScalar(intensity)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(pxW / UNIT, pxH / UNIT), mat)
  mesh.userData.draw = (key, fn) =>
    ct.draw(key, ctx => {
      ctx.scale(res, res)
      fn(ctx)
    })
  return mesh
}

// Soft radial light, additive.
const glowTex = (() => {
  const ct = canvasTexture(256, 256)
  ct.draw(0, ctx => {
    const g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    g.addColorStop(0, 'rgba(255,255,255,1)')
    g.addColorStop(0.25, 'rgba(255,255,255,0.45)')
    g.addColorStop(0.6, 'rgba(255,255,255,0.1)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 256, 256)
  })
  return ct.tex
})()
function glow(size, color, intensity = 1) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color(color).multiplyScalar(intensity), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }),
  )
  return m
}

// Dust: points drifting through the volume, soft discs, sized by distance.
function dust({ count = 600, box = [20, 12, 30], center = [0, 0, 0], size = 0.05, color = '#9ab8ff', seed = 1, drift = [0, 0.06, 0], opacity = 0.6 }) {
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
    uniforms: { time: { value: 0 }, size: { value: size }, scale: { value: 1 }, color: { value: new THREE.Color(color) }, opacity: { value: opacity }, drift: { value: new THREE.Vector3(...drift) } },
    vertexShader: `
      uniform float time, size, scale; uniform vec3 drift; attribute float phase; varying float vA;
      void main(){
        vec3 p = position + drift * time + vec3(sin(time * .4 + phase), cos(time * .33 + phase * 1.7), sin(time * .27 + phase * .7)) * .12;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = max(1., size * scale / -mv.z);
        vA = (.45 + .55 * fract(phase * 7.13)) * smoothstep(.2, 2., -mv.z);
      }`,
    fragmentShader: `
      uniform vec3 color; uniform float opacity; varying float vA;
      void main(){ float d = length(gl_PointCoord - .5); float a = smoothstep(.5, .0, d); gl_FragColor = vec4(color * a * vA * opacity, 1.); }`,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    transparent: true,
  })
  const pts = new THREE.Points(g, mat)
  pts.frustumCulled = false
  pts.userData.tick = (t, camera) => {
    mat.uniforms.time.value = t
    mat.uniforms.scale.value = H / 2 / Math.tan((camera.fov * Math.PI) / 360)
  }
  return pts
}

// A 3D ring: a torus arc from twelve o'clock, clockwise, with round caps, on a dim track.
function ring3d({ R = 1, tube = 0.06, color = BLUE, intensity = 2.2, trackOpacity = 0.35 }) {
  const group = new THREE.Group()
  const track = new THREE.Mesh(
    new THREE.TorusGeometry(R, tube * 0.92, 16, 220),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(GREY), transparent: true, opacity: trackOpacity, depthWrite: false, toneMapped: false }),
  )
  group.add(track)
  const arcMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide, toneMapped: false })
  const arc = new THREE.Mesh(new THREE.BufferGeometry(), arcMat)
  arc.scale.x = -1
  arc.rotation.z = -Math.PI / 2
  group.add(arc)
  const capGeo = new THREE.SphereGeometry(tube, 16, 12)
  const capA = new THREE.Mesh(capGeo, arcMat)
  const capB = new THREE.Mesh(capGeo, arcMat)
  group.add(capA, capB)
  let lastFrac = -1
  group.userData.set = (frac, col = color, inten = intensity, trackColor = null) => {
    const f = clamp(frac, 0, 0.99999)
    arcMat.color.set(col).multiplyScalar(inten)
    track.material.color.set(trackColor ?? GREY)
    track.material.opacity = trackColor ? 0.6 : trackOpacity
    const visible = f > 0.0005
    arc.visible = capA.visible = capB.visible = visible
    if (visible && Math.abs(f - lastFrac) > 0.0004) {
      arc.geometry.dispose()
      arc.geometry = new THREE.TorusGeometry(R, tube, 14, Math.max(8, Math.round(240 * f)), TAU * f)
      lastFrac = f
    }
    // caps: start at 12 o'clock, end clockwise
    capA.position.set(0, R, 0)
    const a = Math.PI / 2 - TAU * f
    capB.position.set(Math.cos(a) * R, Math.sin(a) * R, 0)
  }
  group.userData.set(0)
  return group
}

function cylinderBetween(a, b, radius, mat) {
  const A = new THREE.Vector3(...a)
  const B = new THREE.Vector3(...b)
  const len = A.distanceTo(B)
  const m = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, 1, 12, 1), mat)
  m.scale.y = len
  m.position.copy(A).add(B).multiplyScalar(0.5)
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), B.clone().sub(A).normalize())
  return m
}

const emissive = (hex, k = 1) => new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(k), toneMapped: false })

// Kick-drum breath on the camera through the groove sections.
function pulse(t) {
  if (!GROOVE.some(([a, b]) => t >= a && t < b)) return 0
  const ph = (t % BEAT) / BEAT
  return Math.exp(-ph * 9)
}
function dropHit(t) {
  return DROPS.reduce((m, d) => Math.max(m, t >= d ? Math.exp(-(t - d) * 5) : 0), 0)
}

// Camera with a little life: handheld drift, beat breath, and an optional shake.
function shootCam(camera, t, { pos, tgt, fov, roll = 0, drift = 0.06, shake = 0, breath = 0.5 }) {
  const n = (k, s) => noise1(t * s, k)
  const p = [pos[0] + n(1, 0.35) * drift + n(7, 23) * shake, pos[1] + n(2, 0.3) * drift + n(8, 21) * shake, pos[2] + n(3, 0.27) * drift * 0.5]
  const q = [tgt[0] + n(4, 0.31) * drift * 0.6 + n(9, 19) * shake * 0.6, tgt[1] + n(5, 0.29) * drift * 0.6, tgt[2]]
  aim(camera, p, q, fov - pulse(t) * breath - dropHit(t) * 2.2, roll + n(6, 0.22) * 0.6)
}

// ═══ 01 · TUNNEL — a corridor of the questions you cannot answer, at speed ═══════════════════
function tunnel() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.028)
  const camZ = t => 14 - (16 * t + 8.5 * t * t)
  const Q = [
    { at: 0.5, zh: '缓存还剩几分钟？', en: 'How long until the prompt cache goes cold?', tag: '无从得知', x: -2.9, y: 0.8, ry: 0.28 },
    { at: 1.3, zh: '5 小时额度，用掉多少了？', en: 'How much of the five-hour window is gone?', tag: '/usage', x: 3.0, y: -0.7, ry: -0.28 },
    { at: 2.1, zh: '这周的额度，哪天重置？', en: 'When does the weekly limit reset?', tag: '/usage', x: -2.9, y: -0.9, ry: 0.28 },
    { at: 2.9, zh: '上下文，还装得下吗？', en: 'Is there still room in the context?', tag: '/context', x: 3.0, y: 0.8, ry: -0.28 },
  ]
  const cards = []
  Q.forEach((q, i) => {
    const m = panel(980, 300, { res: 2 })
    m.userData.draw(0, ctx => {
      roundRect(ctx, 4, 4, 972, 292, 30)
      ctx.fillStyle = 'rgba(24,23,21,0.86)'
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.16)
      ctx.lineWidth = 2
      ctx.stroke()
      text(ctx, `0${i + 1}`, 52, 76, F.monoB(26), BLUE)
      text(ctx, q.zh, 50, 172, F.black(82), FG)
      text(ctx, q.en, 52, 240, F.serif(40), DIM)
      const tw2 = measure(ctx, q.tag, F.mono(24)) + 36
      roundRect(ctx, 972 - 40 - tw2, 44, tw2, 46, 23)
      ctx.strokeStyle = rgba(FG, 0.3)
      ctx.stroke()
      text(ctx, q.tag, 972 - 40 - tw2 / 2, 75, q.tag.startsWith('/') ? F.mono(24) : F.reg(24), DIM, { align: 'center' })
    })
    m.position.set(q.x, q.y, camZ(q.at) - 10.5)
    m.scale.setScalar(0.72)
    m.rotation.y = q.ry
    s.scene.add(m)
    cards.push(m)
  })
  // the last card: the promise
  const last = panel(1200, 320, { res: 2, intensity: 1.15 })
  last.userData.draw(0, ctx => {
    text(ctx, '答案，只需要一行。', 600, 170, F.black(110), FG, { align: 'center' })
    text(ctx, 'The answer takes one line.', 600, 250, F.serif(48), DIM, { align: 'center' })
  })
  last.position.set(0, 0.15, camZ(3.5) - 9.5)
  s.scene.add(last)
  // fragments streaming past at the edges
  const FR = ['/usage', '/context', '??:??', '?%', '5h ??', '7d ??', '↻ ?', '上下文 ?', '缓存 ?', '/cost', 'ttl ?', '--:--']
  const r = rng(7)
  for (let i = 0; i < 46; i++) {
    const s0 = FR[i % FR.length]
    const m = panel(360, 110, { res: 1.5 })
    const ringish = i % 3 === 0
    m.userData.draw(0, ctx => {
      roundRect(ctx, 3, 3, 354, 104, 22)
      ctx.fillStyle = 'rgba(30,29,27,0.7)'
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.12)
      ctx.lineWidth = 2
      ctx.stroke()
      if (ringish) ring(ctx, 56, 55, 20, 6, 0, GREY)
      text(ctx, s0, ringish ? 96 : 30, 70, s0.startsWith('/') || /[0-9?]/.test(s0[0]) ? F.mono(36) : F.med(34), DIM)
    })
    const ang = r() * TAU
    const rad = 4.2 + r() * 4.5
    m.position.set(Math.cos(ang) * rad * 1.3, Math.sin(ang) * rad * 0.75, 6 - r() * 150)
    m.rotation.y = -Math.cos(ang) * 0.5
    m.scale.setScalar(0.7 + r() * 0.9)
    s.scene.add(m)
  }
  // light at the end of the corridor
  const end = glow(60, '#bcd2ff', 1.2)
  s.scene.add(end)
  const motes = dust({ count: 1400, box: [26, 16, 190], center: [0, 0, -80], size: 0.07, color: '#a8c2ff', seed: 3, drift: [0, 0, 0], opacity: 0.7 })
  s.scene.add(motes)
  s.update = t => {
    const z = camZ(t)
    shootCam(s.camera, t, { pos: [Math.sin(t * 0.9) * 0.5, Math.cos(t * 0.7) * 0.25, z], tgt: [Math.sin(t * 0.9 + 0.6) * 0.3, 0, z - 10], fov: lerp(48, 74, tw(t, 2.6, 4.3, E.inCubic)), roll: Math.sin(t * 1.3) * 5 + tw(t, 3.2, 4.3, E.inCubic) * 18, drift: 0.04 })
    motes.userData.tick(t, s.camera)
    cards.forEach((c, i) => {
      const d = z - c.position.z
      c.material.opacity = clamp((26 - d) / 10) * clamp((d + 0.5) / 2.5)
      void i
    })
    last.material.opacity = clamp((24 - (z - last.position.z)) / 8)
    end.position.set(0, 0, z - 70)
    end.scale.setScalar(lerp(0.3, 3.2, tw(t, 2.2, 4.3, E.inExpo)))
    end.material.opacity = 1
  }
  return s
}

// ═══ 02 · LINE → MARK ════════════════════════════════════════════════════════════════════════
function lockupParts(scene, { y = 0, R = 1.25, tube = 0.115, wordH = 1.75 } = {}) {
  // 'usage-line' in the mono at 220 px runs 1320 px; the plane is 1360 × 260
  const word = panel(1360, 260, { res: 2.5, intensity: 1.05 })
  word.userData.draw(0, ctx => text(ctx, 'usage-line', 10, 200, F.mono(220), FG))
  const k = wordH / 2.6
  const wordW = 13.2 * k
  // lay out: ring · tail · word, centred on x = 0
  const total = 2 * R + 0.38 + 1.15 + 0.5 + wordW
  const x0 = -total / 2
  const ringX = x0 + R
  const tailA = ringX + R + 0.38
  const tailB = tailA + 1.15
  const wordX = tailB + 0.5
  word.scale.setScalar(k)
  word.position.set(wordX - 0.1 * k + (13.6 * k) / 2, y - 0.07, 0)
  const ringM = ring3d({ R, tube, intensity: 2.6 })
  ringM.position.set(ringX, y, 0)
  const tailMat = emissive(FG, 1.25)
  const tail = cylinderBetween([0, 0, 0], [1, 0, 0], tube * 0.95, tailMat)
  const capL = new THREE.Mesh(new THREE.SphereGeometry(tube * 0.95, 14, 10), tailMat)
  const capR = capL.clone()
  scene.add(word, ringM, tail, capL, capR)
  const setTail = (a, b) => {
    tail.scale.y = Math.max(0.0001, b - a)
    tail.position.set((a + b) / 2, y, 0)
    capL.position.set(a, y, 0)
    capR.position.set(b, y, 0)
  }
  setTail(tailA, tailB)
  return { word, ring: ringM, tail, setTail, ringX, tailA, tailB, R, tube, y, wordX }
}

function logo() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.012)
  const L = lockupParts(s.scene)
  const beamMat = emissive('#cfe0ff', 5)
  const beam = cylinderBetween([0, 0, 0], [1, 0, 0], 0.03, beamMat)
  s.scene.add(beam)
  const tag = panel(1200, 120, { res: 2 })
  tag.position.set(0.2, -2.25, 0)
  s.scene.add(tag)
  const back = glow(30, BLUE, 0.35)
  back.position.set(-1, 0, -6)
  s.scene.add(back)
  const motes = dust({ count: 700, box: [40, 18, 30], center: [0, 0, -4], size: 0.05, seed: 11 })
  s.scene.add(motes)
  s.ringCenter = () => project(s.camera, [L.ringX, 0, 0])
  s.ringInner = () => {
    const c = project(s.camera, [L.ringX, 0, 0])
    const e = project(s.camera, [L.ringX + L.R - L.tube, 0, 0])
    return Math.hypot((e[0] - c[0]) * (W / H), e[1] - c[1])
  }
  s.update = t => {
    // the beam: endless, then gathered into the tail
    const gather = tw(t, 5.35, 6.05, E.inOutExpo)
    const a = lerp(-90, L.tailA, gather)
    const b = lerp(90, L.tailB, gather)
    beam.visible = gather < 0.999
    beam.scale.y = b - a
    beam.position.set((a + b) / 2, 0, 0)
    beam.material.color.set('#cfe0ff').multiplyScalar(lerp(5, 1.3, gather))
    L.tail.visible = L.ring.visible = gather >= 0.999
    const rp = tw(t, 6.0, 6.7, E.outQuart) * 0.83
    L.ring.userData.set(rp, BLUE, 2.6 + 4 * Math.exp(-Math.max(0, t - 6.0) * 4))
    // the word slams in from the lens
    const sl = tw(t, 6.05, 6.4, E.outExpo)
    L.word.visible = t > 6.05
    L.word.position.z = lerp(9, 0, sl)
    L.word.material.opacity = clamp(sl * 1.6)
    tag.userData.draw(Math.round(prog(t, 6.55, 7.3) * 60), ctx => {
      reveal(ctx, '一行，全看清。  ·  Claude Code 插件', 600, 80, F.med(54), FG, prog(t, 6.55, 7.3), { align: 'center', dy: 24, spread: 6, blur: 8 })
    })
    back.material.opacity = 0.6 + 0.4 * Math.exp(-Math.max(0, t - 6) * 2)
    motes.userData.tick(t, s.camera)
    // camera: racing along the beam, swinging round to face the mark, then diving at the ring
    const swing = tw(t, 5.2, 6.15, E.inOutQuint)
    const run = tw(t, 3.9, 5.4, E.lin)
    const pos0 = [lerp(-34, -10, run), 0.32, 1.3]
    const tgt0 = [pos0[0] + 20, 0, 0]
    const pos1 = keys(t, [[6.0, [0.4, 0.25, 15]], [7.6, [0.2, 0.15, 14.4], E.inOutSine], [8.3, [L.ringX, 0, 1.6], E.inExpo]])
    const tgt1 = keys(t, [[6.0, [0.4, 0, 0]], [7.6, [0.3, 0, 0], E.inOutSine], [8.3, [L.ringX, 0, 0], E.inOutCubic]])
    const pos = pos0.map((v, i) => lerp(v, pos1[i], swing))
    const tgt = tgt0.map((v, i) => lerp(v, tgt1[i], swing))
    const shake = 0.06 * Math.exp(-Math.max(0, t - 6.05) * 6) * (t > 6.05 ? 1 : 0)
    shootCam(s.camera, t, { pos, tgt, fov: lerp(64, 34, swing), roll: lerp(-9, 0, swing), shake, drift: 0.05 })
  }
  return s
}

// ═══ 03 · PRODUCT — the app, its layers apart, the row raced along ═════════════════════════════
const WIN = { w: 1600, h: 1000 }
const ROW = { x: 80, y: 640, size: 30, texW: 1500, texH: 90, pad: 16 }
const wx = px => (px - WIN.w / 2) / UNIT
const wy = py => (WIN.h / 2 - py) / UNIT

function windowLayers(scene, { withRow = true } = {}) {
  const group = new THREE.Group()
  scene.add(group)
  const base = panel(WIN.w, WIN.h, { res: 2 })
  base.userData.draw(0, ctx => {
    roundRect(ctx, 2, 2, WIN.w - 4, WIN.h - 4, 30)
    const g = ctx.createLinearGradient(0, 0, WIN.w * 0.4, WIN.h)
    g.addColorStop(0, '#201f1c')
    g.addColorStop(1, SURFACE)
    ctx.fillStyle = g
    ctx.fill()
    ctx.strokeStyle = rgba(FG, 0.34)
    ctx.lineWidth = 2.5
    ctx.stroke()
    for (let i = 0; i < 3; i++) {
      ctx.beginPath()
      ctx.arc(34 + i * 26, 32, 8, 0, TAU)
      ctx.fillStyle = '#3a3835'
      ctx.fill()
    }
    text(ctx, 'api-server', WIN.w / 2, 40, F.med(21), DIM, { align: 'center' })
    ctx.fillStyle = rgba(FG, 0.06)
    ctx.fillRect(2, 64, WIN.w - 4, 2)
  })
  const talk = panel(WIN.w, 560, { res: 2 })
  talk.userData.draw(0, ctx => {
    const ask = '把 token 统计拆成独立模块，顺便补上测试'
    const bw = measure(ctx, ask, F.reg(27)) + 48
    roundRect(ctx, WIN.w - 70 - bw, 40, bw, 64, 20)
    ctx.fillStyle = SURFACE2
    ctx.fill()
    text(ctx, ask, WIN.w - 70 - bw + 24, 82, F.reg(27), FG)
    const ax = 86
    text(ctx, '好的。先读一下现有实现，再拆成三个文件。', ax, 172, F.reg(27), FG)
    const tool = (verb, arg, extra, y, hi) => {
      ctx.beginPath()
      ctx.arc(ax + 6, y - 8, 6, 0, TAU)
      ctx.fillStyle = hi ? BLUE : '#6f6b64'
      ctx.fill()
      text(ctx, verb, ax + 28, y, F.monoB(23), FG)
      text(ctx, arg, ax + 124, y, F.mono(23), DIM)
      if (extra) text(ctx, extra, ax + 124 + measure(ctx, arg, F.mono(23)) + 26, y, F.mono(23), hi ? BLUE : DIM)
    }
    tool('Read', 'src/usage.ts', '', 236, false)
    tool('Edit', 'src/usage/tokens.ts', '+84 −12', 278, false)
    tool('Bash', 'bun test', '18 pass', 320, true)
    text(ctx, '拆分完成，测试全部通过。', ax, 392, F.reg(27), FG)
  })
  talk.position.set(0, wy(66 + 280), 0)
  const prompt = panel(1472, 170, { res: 2 })
  prompt.userData.draw(0, ctx => {
    roundRect(ctx, 2, 2, 1468, 166, 24)
    ctx.fillStyle = SURFACE2
    ctx.fill()
    ctx.strokeStyle = rgba(FG, 0.13)
    ctx.lineWidth = 2
    ctx.stroke()
    text(ctx, '继续说点什么…', 32, 62, F.reg(28), FAINT)
    ctx.beginPath()
    ctx.arc(46, 124, 19, 0, TAU)
    ctx.strokeStyle = rgba(FG, 0.22)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(1472 - 48, 124, 23, 0, TAU)
    ctx.fillStyle = rgba(FG, 0.9)
    ctx.fill()
    ctx.strokeStyle = BG
    ctx.lineWidth = 3.4
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(1424, 133)
    ctx.lineTo(1424, 115)
    ctx.moveTo(1416, 123)
    ctx.lineTo(1424, 115)
    ctx.lineTo(1432, 123)
    ctx.stroke()
  })
  prompt.position.set(wx(64 + 736), wy(680 + 85), 0)
  const row = panel(ROW.texW, ROW.texH, { res: 4 })
  row.position.set(wx(ROW.x - ROW.pad + ROW.texW / 2), wy(ROW.y), 0)
  // the layers stack in a fixed order, whatever the camera's distance to each
  base.renderOrder = 1
  talk.renderOrder = prompt.renderOrder = 2
  row.renderOrder = 3
  group.add(base, talk, prompt)
  if (withRow) group.add(row)
  // the row's own geometry, for aiming at a ring
  const items = rowItems({ cacheLeft: 3600 })
  const lay = rowLayout(row.userData.draw ? document.createElement('canvas').getContext('2d') : null, items, 'full', ROW.size)
  const ringWorld = i => [wx(ROW.x + lay[i].ringX), wy(ROW.y), 0]
  return { group, base, talk, prompt, row, ringWorld, lay }
}

function product() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.01)
  const P = windowLayers(s.scene)
  const shadow = glow(30, '#000000', 1)
  shadow.material.blending = THREE.NormalBlending
  shadow.material.opacity = 0.9
  shadow.position.set(0, -0.6, -1.2)
  s.scene.add(shadow)
  const back = glow(40, BLUE, 0.28)
  back.position.set(2, 1, -9)
  s.scene.add(back)
  // a sheen that travels across the glass
  const sheen = panel(800, 1400, { res: 0.5 })
  sheen.userData.draw(0, ctx => {
    const g = ctx.createLinearGradient(0, 0, 800, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(210,225,255,0.17)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 800, 1400)
  })
  sheen.material.blending = THREE.AdditiveBlending
  sheen.rotation.z = 0.5
  sheen.renderOrder = 4
  P.group.add(sheen)
  const motes = dust({ count: 900, box: [40, 26, 30], center: [0, 0, -2], size: 0.045, seed: 21 })
  s.scene.add(motes)
  const title = panel(1300, 300, { res: 2, intensity: 1.1 })
  title.position.set(-3.4, 3.2, 2.8)
  title.rotation.set(0.35, 0.32, 0)
  s.scene.add(title)
  const [cx, cy] = P.ringWorld(0)
  s.cacheCenter = () => project(s.camera, [cx, cy, P.row.position.z])
  s.update = t => {
    const left = 3600 - Math.max(0, t - 8.0)
    const sweep = i => tw(t, 8.55 + i * 0.32, 9.35 + i * 0.32, E.outQuart)
    const key = `${clockText(left)}|${[0, 1, 2, 3].map(i => Math.round(sweep(i) * 200)).join(',')}`
    P.row.userData.draw(key, ctx => {
      drawRow(ctx, ROW.pad, ROW.texH / 2, rowItems({ cacheLeft: left }), { size: ROW.size, reveal: i => (i === 0 ? 1 : sweep(i)), glow: 10 })
    })
    // exploded view
    const ex = tw(t, 10.7, 11.7, E.inOutQuart) * (1 - tw(t, 12.5, 13.3, E.inOutQuart))
    P.talk.position.z = ex * 1.5
    P.prompt.position.z = ex * 0.7
    P.row.position.z = 0.02 + ex * 2.6
    P.row.material.color.setScalar(1 + ex * 0.4)
    sheen.position.set(lerp(-14, 14, prog(t, 10.4, 13.2)), 0, 0.05 + ex * 2.7)
    motes.userData.tick(t, s.camera)
    const C = (dx, dy, dz) => [cx + dx, cy + dy, dz]
    const pos = keys(t, [
      [7.7, C(0, 0, 1.25)],
      [8.5, C(0.05, 0.02, 1.75), E.outCubic],
      [9.5, C(-1.7, -1.0, 1.55), E.inOutCubic],
      [10.7, C(3.2, -1.15, 1.9), E.inOutSine],
      [11.8, [8.2, -7.6, 9.8], E.inOutCubic],
      [13.1, [0.4, -0.3, 20], E.inOutQuart],
      [13.55, [0.4, -0.5, 18.5], E.inOutSine],
      [14.35, C(0, 0, 1.4), E.inExpo],
    ])
    const tgt = keys(t, [
      [7.7, C(0, 0, 0)],
      [8.5, C(0.05, 0.02, 0)],
      [9.5, C(5.5, 0.15, 0), E.inOutCubic],
      [10.7, C(9.5, 0.2, 0), E.inOutSine],
      [11.8, [0, -0.2, 0.6], E.inOutCubic],
      [13.1, [0, -0.9, 0], E.inOutQuart],
      [13.55, [-0.3, -1.0, 0], E.inOutSine],
      [14.35, C(0, 0, 0), E.inOutCubic],
    ])
    const fov = keys(t, [[7.7, 40], [8.5, 40], [9.5, 56], [10.7, 50], [11.8, 36], [13.1, 34], [14.35, 40, E.inExpo]])
    const roll = keys(t, [[7.7, 0], [8.5, 0], [9.5, -10], [10.7, -6], [11.8, 8], [13.1, 0]])
    title.userData.draw(Math.round(prog(t, 10.9, 11.8) * 60), ctx => {
      reveal(ctx, '就在输入框上方。', 0, 150, F.black(150), FG, prog(t, 10.9, 11.6), { dy: 60, spread: 4, blur: 14 })
      reveal(ctx, 'Right above your prompt.', 6, 250, F.serif(76), DIM, prog(t, 11.15, 11.9), { dy: 30, spread: 10, blur: 8 })
    })
    title.material.opacity = 1 - tw(t, 12.2, 12.7)
    shootCam(s.camera, t, { pos, tgt, fov, roll, drift: 0.05 })
  }
  return s
}

// ═══ 04 · CACHE — the hero ring ═══════════════════════════════════════════════════════════════
function cacheLeftHero(t) {
  if (t < 14.6) return 3600
  if (t < 16.0) return 3600 - (t - 14.6)
  if (t < 18.2) return lerp(3598.6, 60, E.inOutCubic(prog(t, 16.0, 18.2)))
  if (t < 19.4) return lerp(60, 0, E.inCubic(prog(t, 18.2, 19.4)) * 0.4 + prog(t, 18.2, 19.4) * 0.6)
  if (t < 20.2) return 0
  return 3600 - Math.max(0, t - 20.85)
}
export const cacheState = t => {
  const left = cacheLeftHero(t)
  const expired = t >= 19.4 && t < 20.2
  const amber = left > 0 && left < 60
  return { left, expired, amber }
}

function cache() {
  const s = makeShot()
  const R = 3
  const hero = ring3d({ R, tube: 0.17, intensity: 2.6, trackOpacity: 0.3 })
  s.scene.add(hero)
  // minute ticks
  const tickGeo = new THREE.BoxGeometry(0.05, 0.3, 0.05)
  const ticks = new THREE.InstancedMesh(tickGeo, new THREE.MeshBasicMaterial({ toneMapped: false }), 60)
  const m4 = new THREE.Matrix4()
  for (let i = 0; i < 60; i++) {
    const a = Math.PI / 2 - (i / 60) * TAU
    const major = i % 5 === 0
    const r0 = R + 0.62 + (major ? 0.1 : 0)
    m4.compose(new THREE.Vector3(Math.cos(a) * r0, Math.sin(a) * r0, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, a - Math.PI / 2)), new THREE.Vector3(major ? 1.4 : 1, major ? 1.6 : 0.8, 1))
    ticks.setMatrixAt(i, m4)
    ticks.setColorAt(i, new THREE.Color(0x333333))
  }
  s.scene.add(ticks)
  const dial = new THREE.Mesh(new THREE.RingGeometry(R + 1.32, R + 1.345, 256), new THREE.MeshBasicMaterial({ color: new THREE.Color(FG), transparent: true, opacity: 0.18, toneMapped: false }))
  s.scene.add(dial)
  const num = panel(900, 330, { res: 2.2 })
  num.position.set(0, 0.25, 0.7)
  s.scene.add(num)
  const lab = panel(700, 110, { res: 2 })
  lab.position.set(0, -1.25, 0.5)
  lab.userData.draw(0, ctx => {
    text(ctx, '缓存', 350, 58, F.med(54), FG, { align: 'center' })
    text(ctx, 'PROMPT CACHE · TIME LEFT', 350, 100, F.mono(22), DIM, { align: 'center' })
  })
  s.scene.add(lab)
  const back = glow(26, BLUE, 0.5)
  back.position.set(0, 0, -5)
  s.scene.add(back)
  const orbit = dust({ count: 900, box: [16, 16, 6], center: [0, 0, -1], size: 0.06, seed: 31, drift: [0, 0, 0] })
  s.scene.add(orbit)
  // the refill burst: sparks flung from the ring
  const N = 420
  const r = rng(77)
  const bpos = new Float32Array(N * 3)
  const bvel = []
  for (let i = 0; i < N; i++) {
    const a = r() * TAU
    bvel.push([Math.cos(a), Math.sin(a), (r() - 0.5) * 0.6, 2 + r() * 6, a])
  }
  const bg = new THREE.BufferGeometry()
  bg.setAttribute('position', new THREE.BufferAttribute(bpos, 3))
  const burst = new THREE.Points(bg, new THREE.PointsMaterial({ size: 0.07, color: new THREE.Color(BLUE).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  burst.frustumCulled = false
  s.scene.add(burst)
  // facts, flying in from the deep
  const FACTS = [
    ['1h', '订阅缓存时长', 'SUBSCRIPTION TTL'],
    ['5m', '超额用量，自动识别', 'EXTRA USAGE, DETECTED'],
    ['子代理', '请求不打断计时', 'SUBAGENTS LEAVE IT'],
  ]
  const facts = FACTS.map(([k, v, en], i) => {
    const m = panel(620, 150, { res: 2 })
    m.userData.draw(0, ctx => {
      roundRect(ctx, 3, 3, 614, 144, 22)
      ctx.fillStyle = 'rgba(27,26,24,0.88)'
      ctx.fill()
      ctx.strokeStyle = rgba(BLUE, 0.45)
      ctx.lineWidth = 2
      ctx.stroke()
      text(ctx, k, 34, 92, /^[0-9]/.test(k) ? F.monoB(60) : F.black(46), FG)
      const kx = 34 + measure(ctx, k, /^[0-9]/.test(k) ? F.monoB(60) : F.black(46)) + 26
      text(ctx, v, kx, 78, F.med(32), FG)
      text(ctx, en, kx, 116, F.mono(18), DIM)
    })
    m.position.set(8.6, 2.3 - i * 2.3, 0)
    m.scale.setScalar(1.3)
    s.scene.add(m)
    return m
  })
  let lastTick = ''
  s.update = t => {
    const { left, expired, amber } = cacheState(t)
    const refill = tw(t, 20.2, 20.85, E.outBack)
    const frac = t >= 20.2 ? Math.min(1, refill) : left / 3600
    const col = expired ? RED : amber ? mix(BLUE, AMBER, prog(t, 18.2, 18.45)) : BLUE
    const boost = 2.6 + 5 * Math.exp(-Math.max(0, t - 20.2) * 5) * (t >= 20.2 ? 1 : 0) + 3 * Math.exp(-Math.max(0, t - 18.2) * 5) * (t >= 18.2 ? 1 : 0)
    hero.userData.set(expired ? 0 : frac, col, boost, expired ? RED : null)
    const key = `${Math.round(frac * 60)}|${col}`
    if (key !== lastTick) {
      lastTick = key
      for (let i = 0; i < 60; i++) {
        const lit = i / 60 < frac - 0.002
        ticks.setColorAt(i, lit ? new THREE.Color(col).multiplyScalar(i % 5 === 0 ? 2.2 : 1.3) : new THREE.Color(i % 5 === 0 ? 0x3a3a3a : 0x262626))
      }
      ticks.instanceColor.needsUpdate = true
    }
    const value = expired ? '过期' : clockText(left)
    num.userData.draw(value + col, ctx => {
      if (expired) text(ctx, value, 450, 250, F.black(200), RED, { align: 'center' })
      else text(ctx, value, 450, 250, F.monoB(196), amber ? AMBER : FG, { align: 'center' })
    })
    back.material.color.set(expired ? RED : amber ? AMBER : BLUE).multiplyScalar(expired ? 0.7 : 0.5)
    orbit.userData.tick(t, s.camera)
    orbit.rotation.z = -t * 0.12
    // burst
    const bt = t - 20.2
    burst.visible = bt > 0 && bt < 1.6
    if (burst.visible) {
      for (let i = 0; i < N; i++) {
        const [dx, dy, dz, sp, a] = bvel[i]
        const d = R + sp * (1 - Math.exp(-bt * 3)) * 0.9
        bpos[i * 3] = Math.cos(a) * d
        bpos[i * 3 + 1] = Math.sin(a) * d
        bpos[i * 3 + 2] = dz * bt * 3
        void dx
        void dy
      }
      bg.attributes.position.needsUpdate = true
      burst.material.opacity = Math.exp(-bt * 2.2)
    }
    facts.forEach((m, i) => {
      const p = tw(t, 20.75 + i * 0.16, 21.35 + i * 0.16, E.outExpo)
      m.visible = p > 0
      m.position.z = lerp(-26, 0, p)
      m.rotation.y = lerp(-0.9, -0.18, p)
      m.material.opacity = clamp(p * 1.5)
    })
    // camera
    const shake = expired ? 0.16 * Math.exp(-(t - 19.4) * 4) : 0
    const pos = keys(t, [
      [13.8, [0, 0, 5.2]],
      [15.6, [-5.6, -2.0, 8.6], E.outCubic],
      [18.2, [5.4, 1.9, 8.2], E.inOutSine],
      [19.35, [1.6, 0.4, 6.6], E.inOutCubic],
      [19.6, [0, 0, 9.8], E.outExpo],
      [20.2, [0, 0, 9.4], E.inOutSine],
      [20.5, [0, 0, 8.3], E.outExpo],
      [21.9, [0.2, 0.4, 16.5], E.inOutCubic],
    ])
    const tgt = keys(t, [[13.8, [0, 0, 0]], [15.0, [0, -0.7, 0]], [20.5, [0, -0.7, 0]], [21.9, [4.2, -0.6, 0], E.inOutCubic]])
    const roll = keys(t, [[13.8, 8], [15.6, -6, E.outCubic], [18.2, 5, E.inOutSine], [19.35, 0], [21.9, -2]])
    shootCam(s.camera, t, { pos, tgt, fov: 42, roll, shake, drift: 0.07, breath: 0.6 })
  }
  return s
}

// ═══ 05 · LIMITS — two gauges, then a runway through the thresholds ══════════════════════════
const FIVE = [[22.3, 0], [23.2, 13, E.outCubic], [24.8, 13], [25.5, 47], [25.9, 47], [26.9, 74], [27.25, 74], [28.1, 93]]
const SEVEN = [[22.45, 0], [23.35, 63, E.outCubic], [26.4, 63], [27.3, 71]]
const RUN = { y: -1.6, z0: 2, perPct: -0.4 }
const zOf = pct => RUN.z0 + pct * RUN.perPct

function limits() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.022)
  const gauges = [
    { x: -2.3, name: '5 小时额度', key: FIVE, reset: [[22.3, 174], [28.6, 118, E.inOutSine]] },
    { x: 2.3, name: '7 天额度', key: SEVEN, reset: [[22.3, 6060], [28.6, 5952, E.inOutSine]] },
  ].map(g => {
    const rg = ring3d({ R: 1.55, tube: 0.1, intensity: 2.4 })
    rg.position.set(g.x, 1.4, 0)
    const pct = panel(560, 200, { res: 2 })
    pct.position.set(g.x, 1.42, 0.3)
    const lab = panel(700, 150, { res: 2 })
    lab.position.set(g.x, -0.6, 0)
    s.scene.add(rg, pct, lab)
    return { ...g, rg, pct, lab }
  })
  // the runway
  const len = 100 * -RUN.perPct
  const lane = (x, pctA, pctB, col, k) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.02, (pctB - pctA) * -RUN.perPct), emissive(col, k))
    m.position.set(x, RUN.y, (zOf(pctA) + zOf(pctB)) / 2)
    s.scene.add(m)
  }
  for (const x of [-1.5, 1.5]) {
    lane(x, 0, 70, BLUE, 1.6)
    lane(x, 70, 90, AMBER, 2)
    lane(x, 90, 100, RED, 2.2)
  }
  for (let p = 0; p <= 100; p += 2) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(p % 10 === 0 ? 0.5 : 0.18, 0.01, 0.03), emissive(FG, p % 10 === 0 ? 0.5 : 0.18))
    m.position.set(0, RUN.y, zOf(p))
    s.scene.add(m)
    if (p % 10 === 0) {
      const tl = panel(200, 70, { res: 2 })
      tl.userData.draw(0, ctx => text(ctx, `${p}%`, 100, 52, F.mono(44), p === 70 ? AMBER : p === 90 ? RED : DIM, { align: 'center' }))
      tl.rotation.x = -Math.PI / 2
      tl.position.set(-2.3, RUN.y + 0.01, zOf(p))
      s.scene.add(tl)
    }
  }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(4, len + 6), new THREE.MeshBasicMaterial({ color: 0x15161a, transparent: true, opacity: 0.8, toneMapped: false }))
  floor.rotation.x = -Math.PI / 2
  floor.position.set(0, RUN.y - 0.01, zOf(50))
  s.scene.add(floor)
  // gates at 70 and 90
  const gates = [
    [70, AMBER, '70%  琥珀'],
    [90, RED, '90%  红色'],
  ].map(([p, col, l]) => {
    const g = new THREE.Mesh(new THREE.TorusGeometry(2.1, 0.06, 12, 120, Math.PI), emissive(col, 2.6))
    g.position.set(0, RUN.y, zOf(p))
    const lb = panel(500, 110, { res: 2, intensity: 1.2 })
    lb.userData.draw(0, ctx => text(ctx, l, 250, 80, F.black(70), col, { align: 'center' }))
    lb.position.set(0, RUN.y + 2.55, zOf(p))
    const halo = glow(7, col, 0.35)
    halo.position.set(0, RUN.y + 1, zOf(p) - 0.1)
    s.scene.add(g, lb, halo)
    return { p, col, g, halo }
  })
  // markers riding the lanes
  const markers = [
    { key: FIVE, x: -0.55, l: '5h' },
    { key: SEVEN, x: 0.55, l: '7d' },
  ].map(mk => {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.16, 0.36, 3), emissive(BLUE, 2.5))
    cone.rotation.x = Math.PI
    const lbl = panel(420, 120, { res: 2 })
    s.scene.add(cone, lbl)
    return { ...mk, cone, lbl }
  })
  const motes = dust({ count: 1200, box: [20, 10, 60], center: [0, 1, -18], size: 0.05, seed: 41 })
  s.scene.add(motes)
  s.update = t => {
    gauges.forEach((g, i) => {
      const v = keys(t, g.key)
      const col = ringColor(v)
      g.rg.userData.set(v / 100, col, 2.4 + 3 * Math.exp(-Math.abs(t - (i === 0 ? 26.75 : 27.0)) * 8))
      g.pct.userData.draw(`${Math.round(v)}${col}`, ctx => text(ctx, `${Math.round(v)}%`, 280, 140, F.monoB(130), col === BLUE ? FG : col, { align: 'center' }))
      const rs = span(keys(t, g.reset))
      g.lab.userData.draw(rs, ctx => {
        text(ctx, g.name, 350, 60, F.med(46), FG, { align: 'center' })
        text(ctx, `↻ ${rs} 后重置`, 350, 118, F.mono(34), DIM, { align: 'center' })
      })
      const e = tw(t, 22.1 + i * 0.12, 22.9 + i * 0.12, E.outExpo)
      g.rg.scale.setScalar(lerp(0.6, 1, e))
      g.rg.visible = g.pct.visible = g.lab.visible = e > 0
    })
    markers.forEach(mk => {
      const v = keys(t, mk.key)
      const col = ringColor(v)
      const z = zOf(v)
      mk.cone.position.set(mk.x, RUN.y + 0.32 + Math.sin(t * 5) * 0.03, z)
      mk.cone.material.color.set(col).multiplyScalar(2.6)
      mk.lbl.position.set(mk.x * 1.6, RUN.y + 0.95, z)
      mk.lbl.lookAt(s.camera.position)
      mk.lbl.userData.draw(`${Math.round(v)}${col}`, ctx => {
        roundRect(ctx, 4, 4, 412, 112, 22)
        ctx.fillStyle = 'rgba(20,20,22,0.85)'
        ctx.fill()
        ctx.strokeStyle = rgba(col, 0.8)
        ctx.lineWidth = 3
        ctx.stroke()
        text(ctx, mk.l, 36, 80, F.monoB(48), DIM)
        text(ctx, `${Math.round(v)}%`, 384, 84, F.monoB(66), col === BLUE ? FG : col, { align: 'right' })
      })
    })
    gates.forEach(g => {
      const v5 = keys(t, FIVE)
      const passed = v5 >= g.p
      const crossT = g.p === 70 ? 26.75 : 27.9
      const flash = t > crossT ? Math.exp(-(t - crossT) * 3) : 0
      g.g.material.color.set(g.col).multiplyScalar(2.2 + flash * 6 + (passed ? 1 : 0))
      g.halo.material.opacity = 0.4 + flash
    })
    motes.userData.tick(t, s.camera)
    // camera: frontal on the gauges → down onto the runway, riding behind the 5h marker
    const mz = zOf(keys(t, FIVE))
    const ride = tw(t, 23.7, 24.7, E.inOutQuart)
    const rise = tw(t, 28.3, 29.9, E.inOutCubic)
    const frontPos = keys(t, [[21.75, [0.6, 1.6, 11.5]], [23.7, [0, 1.3, 9.2], E.outCubic]])
    const ridePos = [-0.95, RUN.y + 0.62, mz + 3.4]
    const rideTgt = [-0.25, RUN.y + 0.3, mz - 9]
    const topPos = [5.5, 9, zOf(80) + 9]
    const topTgt = [0, RUN.y, zOf(78)]
    let pos = frontPos.map((v, i) => lerp(v, ridePos[i], ride))
    let tgt = [0, 1.0, 0].map((v, i) => lerp(v, rideTgt[i], ride))
    pos = pos.map((v, i) => lerp(v, topPos[i], rise))
    tgt = tgt.map((v, i) => lerp(v, topTgt[i], rise))
    const fov = lerp(lerp(40, 64, ride), 44, rise)
    const roll = lerp(lerp(0, -6, ride), 8, rise)
    const shake = 0.05 * (Math.exp(-Math.abs(t - 26.75) * 8) + Math.exp(-Math.abs(t - 27.9) * 8))
    shootCam(s.camera, t, { pos, tgt, fov, roll, shake, drift: 0.05, breath: 0.7 })
  }
  return s
}

// ═══ 06 · CONTEXT — a window filling, then cleared ═════════════════════════════════════════════
function context() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.02)
  const g = ring3d({ R: 1.75, tube: 0.12, intensity: 2.5 })
  g.position.set(-3.4, 0.2, 0)
  const pct = panel(560, 200, { res: 2 })
  pct.position.set(-3.4, 0.28, 0.3)
  const lab = panel(500, 80, { res: 2 })
  lab.position.set(-3.4, -0.45, 0.3)
  lab.userData.draw(0, ctx => text(ctx, '上下文', 250, 58, F.med(46), DIM, { align: 'center' }))
  s.scene.add(g, pct, lab)
  // the context window: a glass box
  const box = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(3.2, 5.2, 1.4)), new THREE.LineBasicMaterial({ color: new THREE.Color(FG).multiplyScalar(0.5), transparent: true, opacity: 0.6, toneMapped: false }))
  box.position.set(2.2, 0, 0)
  s.scene.add(box)
  const glass = new THREE.Mesh(new THREE.BoxGeometry(3.2, 5.2, 1.4), new THREE.MeshBasicMaterial({ color: new THREE.Color(BLUE), transparent: true, opacity: 0.04, depthWrite: false, toneMapped: false }))
  glass.position.copy(box.position)
  s.scene.add(glass)
  const r = rng(5)
  const cardTex = Array.from({ length: 4 }, (_, k) => {
    const ct = canvasTexture(560, 80)
    ct.draw(0, ctx => {
      roundRect(ctx, 2, 2, 556, 76, 14)
      ctx.fillStyle = k === 0 ? '#2b3a55' : '#2a2826'
      ctx.fill()
      ctx.fillStyle = k === 0 ? rgba(BLUE, 0.9) : rgba(FG, 0.5)
      for (let i = 0; i < 3; i++) ctx.fillRect(24 + i * 20, 30, 10, 10)
      ctx.fillStyle = rgba(FG, 0.35)
      ctx.fillRect(110, 26, 220 + k * 50, 10)
      ctx.fillRect(110, 46, 140 + k * 30, 8)
    })
    return ct.tex
  })
  const N = 13
  const cards = Array.from({ length: N }, (_, i) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(2.8, 0.34, 1.1), [
      new THREE.MeshBasicMaterial({ color: 0x232120, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0x232120, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0x34322f, toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0x1a1918, toneMapped: false }),
      new THREE.MeshBasicMaterial({ map: cardTex[i % 4], toneMapped: false }),
      new THREE.MeshBasicMaterial({ color: 0x232120, toneMapped: false }),
    ])
    m.userData.spin = [(r() - 0.5) * 8, (r() - 0.5) * 8, (r() - 0.5) * 8]
    m.userData.fly = [(r() - 0.3) * 9, 2 + r() * 6, 2 + r() * 8]
    s.scene.add(m)
    return m
  })
  const clear = panel(560, 160, { res: 2, intensity: 1.2 })
  clear.userData.draw(0, ctx => {
    roundRect(ctx, 4, 4, 552, 152, 30)
    ctx.fillStyle = 'rgba(14,14,16,0.92)'
    ctx.fill()
    ctx.strokeStyle = rgba(BLUE, 0.9)
    ctx.lineWidth = 4
    ctx.stroke()
    text(ctx, '/clear', 280, 108, F.monoB(84), FG, { align: 'center' })
  })
  s.scene.add(clear)
  const motes = dust({ count: 700, box: [24, 14, 20], center: [0, 0, -3], size: 0.05, seed: 51 })
  s.scene.add(motes)
  const fill = t => keys(t, [[30.2, 0], [30.95, 25, E.outCubic], [31.2, 25], [32.1, 40], [32.6, 40], [33.2, 2, E.outExpo]])
  s.update = t => {
    const v = fill(t)
    g.userData.set(v / 100, BLUE, 2.5)
    pct.userData.draw(Math.round(v), ctx => text(ctx, `${Math.round(v)}%`, 280, 140, F.monoB(130), FG, { align: 'center' }))
    // cards drop in as the fill rises, then blast out on /clear
    const shown = Math.round((Math.min(v, 40) / 40) * 9)
    const blast = t - 32.55
    cards.forEach((c, i) => {
      const dropAt = 30.2 + i * 0.2
      const d = tw(t, dropAt, dropAt + 0.45, E.outBack)
      const restY = -2.35 + i * 0.4
      const on = i < 9 && t >= dropAt
      c.visible = on && (blast < 1.6)
      if (!c.visible) return
      c.position.set(2.2, lerp(3.6, restY, d), 0)
      c.rotation.set(0, 0, 0)
      if (blast > 0) {
        const k = 1 - Math.exp(-blast * 2.5)
        c.position.x += c.userData.fly[0] * k
        c.position.y += c.userData.fly[1] * k - blast * blast * 1.5
        c.position.z += c.userData.fly[2] * k
        c.rotation.set(...c.userData.spin.map(sp => sp * blast * 0.4))
      }
    })
    void shown
    const cp = tw(t, 32.25, 32.55, E.outExpo)
    clear.visible = t > 32.25 && t < 33.5
    clear.position.set(2.2, 0.3, lerp(8, 1.2, cp))
    clear.material.opacity = 1 - tw(t, 33.0, 33.4)
    motes.userData.tick(t, s.camera)
    const pos = keys(t, [[29.7, [-3, 2.2, 11.5]], [32.4, [2.6, -0.6, 10.2], E.inOutSine], [33.0, [1.6, 0.2, 12.5], E.outExpo], [34.3, [0.6, 0.6, 11.8], E.inOutSine]])
    const tgt = keys(t, [[29.7, [-0.6, 0.2, 0]], [34.3, [-0.4, 0, 0]]])
    const shake = t > 32.55 ? 0.1 * Math.exp(-(t - 32.55) * 5) : 0
    shootCam(s.camera, t, { pos, tgt, fov: 40, roll: keys(t, [[29.7, -5], [32.4, 4], [34.3, 0]]), shake, drift: 0.06, breath: 0 })
  }
  return s
}

// ═══ 07 · NARROW → FLIP → TERMINAL → INSTALL ════════════════════════════════════════════════════
const CMD1 = '/plugin marketplace add sundyme/usage-line'
const CMD2 = '/plugin install usage-line@usage-line'

function terminal() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.012)
  const group = new THREE.Group()
  s.scene.add(group)
  const PW = 1700
  const PH = 330
  const front = panel(PW, PH, { res: 2, side: THREE.FrontSide })
  group.add(front)
  const TW = 1700
  const TH = 640
  const back = panel(TW, TH, { res: 2, side: THREE.FrontSide })
  back.rotation.y = Math.PI
  group.add(back)
  const halo = glow(30, BLUE, 0.3)
  halo.position.set(0, 0, -6)
  s.scene.add(halo)
  const motes = dust({ count: 900, box: [30, 16, 24], center: [0, 0, -4], size: 0.05, seed: 61 })
  s.scene.add(motes)
  // sparks on success
  const N = 260
  const r = rng(9)
  const sp = Array.from({ length: N }, () => [r() * TAU, 1 + r() * 4, (r() - 0.5) * 2])
  const sg = new THREE.BufferGeometry()
  const spos = new Float32Array(N * 3)
  sg.setAttribute('position', new THREE.BufferAttribute(spos, 3))
  const sparks = new THREE.Points(sg, new THREE.PointsMaterial({ size: 0.06, color: new THREE.Color(BLUE).multiplyScalar(3), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  sparks.frustumCulled = false
  group.add(sparks)
  // the second check mark, in the group's frame (the terminal is the flipped back face)
  const checkAt = [(TW / 2 - 125) / UNIT, (TH / 2 - 255) / UNIT]
  s.update = t => {
    const live = 3600 - (t - 33.2)
    const items = rowItems({ cacheLeft: live })
    // front: the desktop row folding as the window narrows
    const width = keys(t, [[34.6, 1640], [35.4, 1180, E.inOutExpo], [36.0, 1180], [36.7, 720, E.inOutExpo]])
    const mode = width > 1340 ? 'full' : width > 900 ? 'short' : 'none'
    const switchAt = mode === 'short' ? 34.95 : mode === 'none' ? 36.25 : null
    const from = mode === 'short' ? 'full' : mode === 'none' ? 'short' : null
    const p = switchAt ? prog(t, switchAt, switchAt + 0.4) : 1
    front.userData.draw(`${Math.round(width)}|${clockText(live)}|${Math.round(p * 40)}`, ctx => {
      const x = (PW - width) / 2
      roundRect(ctx, x + 2, 2, width - 4, PH - 4, 28)
      ctx.fillStyle = SURFACE
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.13)
      ctx.lineWidth = 2
      ctx.stroke()
      ctx.save()
      roundRect(ctx, x + 2, 2, width - 4, PH - 4, 28)
      ctx.clip()
      drawRow(ctx, x + 40, 64, items, { size: 34, mode, from, p, glow: 8 })
      roundRect(ctx, x + 26, 118, width - 52, 186, 24)
      ctx.fillStyle = SURFACE2
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.1)
      ctx.stroke()
      text(ctx, '继续说点什么…', x + 58, 186, F.reg(30), FAINT)
      ctx.restore()
    })
    // back: the terminal, the hint row's tail, then the install
    const typed1 = tw(t, 39.45, 40.55, E.lin)
    const typed2 = tw(t, 40.95, 41.85, E.lin)
    const ok1 = t > 40.75
    const ok2 = t > 42.0
    const stage = t < 40.65 ? 0 : t < 42.0 ? 1 : 2
    const reach = tw(t, 37.9, 38.9, E.lin)
    const blink = Math.floor(t * 2.2) % 2
    back.userData.draw(`${stage}|${Math.round(typed1 * 60)}|${Math.round(typed2 * 60)}|${clockText(live)}|${Math.round(reach * 20)}|${blink}|${ok1}|${ok2}|${Math.round(tw(t, 42.0, 42.4) * 20)}`, ctx => {
      roundRect(ctx, 2, 2, TW - 4, TH - 4, 26)
      ctx.fillStyle = '#0b0b0a'
      ctx.fill()
      ctx.strokeStyle = rgba(FG, 0.14)
      ctx.lineWidth = 2
      ctx.stroke()
      const mf = F.mono(34)
      // history
      if (stage >= 1) {
        text(ctx, '>', 70, 92, F.monoB(34), DIM)
        text(ctx, CMD1, 110, 92, mf, DIM)
        if (ok1) {
          check(ctx, 112, 140, 26, BLUE, 1)
          text(ctx, 'usage-line 插件市场已添加', 158, 150, F.med(32), FG)
        }
      }
      if (stage >= 2) {
        text(ctx, '>', 70, 214, F.monoB(34), DIM)
        text(ctx, CMD2, 110, 214, mf, DIM)
        check(ctx, 112, 262, 26, BLUE, tw(t, 42.0, 42.35))
        text(ctx, '已安装并启用 usage-line', 158, 272, F.med(32), FG, { alpha: tw(t, 42.0, 42.3) })
      }
      // the input box
      roundRect(ctx, 40, 336, TW - 80, 112, 14)
      ctx.strokeStyle = rgba(FG, 0.34)
      ctx.lineWidth = 2.5
      ctx.stroke()
      text(ctx, '>', 72, 404, F.monoB(36), FG)
      const cur = stage === 0 ? CMD1 : stage === 1 ? CMD2 : ''
      const cp = stage === 0 ? typed1 : stage === 1 ? typed2 : 0
      if (t > 39.4 && cur) typed(ctx, cur, 112, 404, F.mono(36), FG, cp, { caret: true, t, size: 36 })
      else if (blink === 0) {
        ctx.fillStyle = rgba(FG, 0.85)
        ctx.fillRect(112, 374, 19, 38)
      }
      // hint row with the line as its tail
      const hy = 528
      let x = 72
      const tf = F.mono(29)
      const put = (str, col = DIM) => {
        text(ctx, str, x, hy, tf, col)
        x += measure(ctx, str, tf)
      }
      put('? for shortcuts')
      x += 64
      const cw = measure(ctx, ' ', tf)
      items.forEach((it, i) => {
        const a = clamp(reach * 5 - i)
        if (a <= 0) return
        ctx.save()
        ctx.globalAlpha = a
        pie(ctx, x + cw * 0.5, hy - 10, 11, it.frac, DIM)
        x += cw * 2
        put(`${it.value} ${it.label.replace(' ', ' ')}`)
        ctx.restore()
        x += cw * 3
      })
    })
    // flip
    const flip = tw(t, 37.0, 38.0, E.inOutExpo)
    group.rotation.y = flip * Math.PI
    group.rotation.x = Math.sin(flip * Math.PI) * 0.25
    group.position.z = -Math.sin(flip * Math.PI) * 2.5
    halo.material.opacity = 0.5 + Math.sin(flip * Math.PI) * 1.5 + 2 * (t > 42 ? Math.exp(-(t - 42) * 3) : 0)
    // sparks from the check
    const bt = t - 42.0
    sparks.visible = bt > 0 && bt < 1.4
    if (sparks.visible) {
      sp.forEach(([a, v, z], i) => {
        const d = v * (1 - Math.exp(-bt * 3.5))
        spos[i * 3] = checkAt[0] + Math.cos(a) * d
        spos[i * 3 + 1] = checkAt[1] + Math.sin(a) * d * 0.6 - bt * bt * 0.8
        spos[i * 3 + 2] = -0.08 - Math.abs(z) * bt * 0.6
      })
      sg.attributes.position.needsUpdate = true
      sparks.material.opacity = Math.exp(-bt * 2)
    }
    motes.userData.tick(t, s.camera)
    // camera
    const pos = keys(t, [
      [33.75, [-4.6, 2.8, 14.5]],
      [36.9, [-2.4, 1.4, 12.6], E.outCubic],
      [38.1, [3.6, 0.6, 12.2], E.inOutQuart],
      [39.3, [2.8, 0.2, 11.2], E.inOutSine],
      [41.9, [-1.8, 0.3, 11.6], E.inOutSine],
      [43.6, [-0.8, 0.0, 12.0], E.inOutSine],
      [46.3, [0.5, -0.6, 2.4], E.inExpo],
    ])
    const tgt = keys(t, [
      [33.75, [0, -0.9, 0]],
      [38.1, [0, -1.0, 0]],
      [39.3, [0, -0.9, 0]],
      [41.9, [0.4, -0.7, 0], E.inOutSine],
      [43.6, [0.2, -0.7, 0], E.inOutSine],
      [46.3, [0, 0.4, 0], E.inOutCubic],
    ])
    const fov = keys(t, [[33.75, 38], [38.1, 42], [41.9, 46], [43.6, 44], [46.3, 60, E.inExpo]])
    const roll = keys(t, [[33.75, 5], [36.9, 2], [38.1, -4], [41.9, 3], [46.3, -10, E.inExpo]])
    shootCam(s.camera, t, { pos, tgt, fov, roll, drift: 0.06, breath: 0.5 })
  }
  return s
}

// ═══ 08 · FINALE ═════════════════════════════════════════════════════════════════════════════
function finale() {
  const s = makeShot()
  s.scene.fog = new THREE.FogExp2(0x000000, 0.01)
  const L = lockupParts(s.scene, { y: 0.3 })
  // a soft mirror on the floor
  const mirror = new THREE.Group()
  const mRing = ring3d({ R: L.R, tube: L.tube, intensity: 0.5, trackOpacity: 0.08 })
  mRing.position.set(L.ringX, -2.2 - 0.3, 0)
  mirror.add(mRing)
  const tag = panel(1400, 220, { res: 2 })
  tag.position.set(0, -1.85, 0.2)
  s.scene.add(tag)
  const back = glow(36, BLUE, 0.45)
  back.position.set(0, 0.3, -7)
  s.scene.add(back)
  const sweepTex = canvasTexture(512, 64)
  sweepTex.draw(0, ctx => {
    const g = ctx.createLinearGradient(0, 0, 512, 0)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(0.5, 'rgba(220,232,255,0.5)')
    g.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, 512, 64)
  })
  const sweep = new THREE.Mesh(new THREE.PlaneGeometry(3, 4), new THREE.MeshBasicMaterial({ map: sweepTex.tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }))
  sweep.rotation.z = 0.35
  s.scene.add(sweep)
  const motes = dust({ count: 1100, box: [40, 20, 26], center: [0, 0, -4], size: 0.05, seed: 81 })
  s.scene.add(motes)
  s.update = t => {
    const close = tw(t, 46.6, 47.5, E.inOutQuart)
    L.ring.userData.set(lerp(0.83, 1, close), BLUE, 2.6 + 6 * Math.exp(-Math.max(0, t - 47.5) * 3) * (t > 47.5 ? 1 : 0) + 4 * Math.exp(-Math.max(0, t - 46) * 4))
    mRing.userData.set(lerp(0.83, 1, close), BLUE, 0.45)
    L.word.material.opacity = 1
    tag.userData.draw(Math.round(prog(t, 47.6, 48.8) * 60), ctx => {
      reveal(ctx, '一行，全看清。', 700, 92, F.black(80), FG, prog(t, 47.6, 48.3), { align: 'center', dy: 30, spread: 4, blur: 10 })
      reveal(ctx, 'github.com/sundyme/usage-line', 700, 178, F.mono(40), DIM, prog(t, 48.1, 48.8), { align: 'center', dy: 14, spread: 10, blur: 6 })
    })
    sweep.position.set(lerp(-9, 9, prog(t, 47.3, 48.6)), 0.3, 0.3)
    back.material.opacity = 0.7 + 0.6 * Math.exp(-Math.max(0, t - 47.5) * 2) * (t > 47.5 ? 1 : 0)
    motes.userData.tick(t, s.camera)
    const pos = keys(t, [[45.75, [-7.5, -1.6, 4.5]], [48.4, [0.2, 0.35, 13.5], E.outQuart], [52, [0.2, 0.3, 11.6], E.inOutSine]])
    const tgt = keys(t, [[45.75, [-2, 0.2, 0]], [48.4, [0.1, -0.15, 0], E.outQuart], [52, [0.1, -0.2, 0]]])
    shootCam(s.camera, t, { pos, tgt, fov: keys(t, [[45.75, 56], [48.4, 34, E.outQuart], [52, 33]]), roll: keys(t, [[45.75, 14], [48.4, 0, E.outQuart]]), drift: 0.05, breath: 0.4 })
  }
  return s
}

// ═══ assembly ════════════════════════════════════════════════════════════════════════════════
export function buildShots() {
  const shots = { tunnel: tunnel(), logo: logo(), product: product(), cache: cache(), limits: limits(), context: context(), terminal: terminal(), finale: finale() }
  // transition geometry that follows what the camera sees
  const cutParams = {
    logo_product: t => {
      shots.logo.update(t)
      const c = shots.logo.ringCenter()
      const r0 = shots.logo.ringInner()
      const p = prog(t, 7.7, 8.3)
      return { center: [c[0], c[1]], radius: r0 * lerp(1, 0.98, p) + E.inExpo(p) * 1.4 }
    },
    product_cache: t => {
      shots.product.update(t)
      const c = shots.product.cacheCenter()
      return { center: [c[0], c[1]] }
    },
  }
  const plan = t => {
    const cut = CUTS.find(([, , a, b]) => t >= a && t < b)
    if (cut) {
      const [from, to, a, b, kind] = cut
      const p = prog(t, a, b)
      const extra = cutParams[`${from}_${to}`]?.(t) ?? {}
      return {
        a: shots[from],
        b: shots[to],
        kind,
        p: kind === 4 ? E.inOutQuart(p) : kind === 5 ? E.inOutCubic(p) : p,
        dir: from === 'context' ? [0, -1] : [1, 0],
        bloomStrength: 0.6,
        ...extra,
      }
    }
    const name = Object.keys(SHOTS).find(k => t >= SHOTS[k][0] && t < SHOTS[k][1]) ?? 'finale'
    return { a: shots[name], bloomStrength: { tunnel: 0.75, logo: 0.8, cache: 0.75, finale: 0.85 }[name] ?? 0.6 }
  }
  return { shots, plan }
}

// ═══ HUD: the headlines and the frame's instrument marks ════════════════════════════════════════
const HEADS = [
  [14.7, 21.55, '缓存倒计时，精确到秒。', 'Know the moment your prompt cache goes cold.'],
  [22.35, 29.55, '额度用了多少，何时重置。', "How much you've used, and when it resets."],
  [30.35, 33.65, '上下文占用，一直在眼前。', 'Context fill, re-read after /clear and compaction.'],
  [34.45, 36.95, '窗口再窄，也不挤压。', 'Narrow window? It folds, it never squeezes.'],
  [37.85, 39.3, '终端里，一样原生。', 'And right at home in the terminal.'],
  [39.5, 44.6, '两行命令，即刻装好。', 'Two commands, and it is there.'],
]
const CHAPTERS = [
  [0, '01', '问题', 'QUESTIONS'],
  [4, '02', '一行', 'ONE LINE'],
  [8, '03', '原位', 'IN PLACE'],
  [14, '04', '缓存', 'CACHE'],
  [22, '05', '额度', 'LIMITS'],
  [30, '06', '上下文', 'CONTEXT'],
  [34, '07', '自适应', 'ADAPTIVE'],
  [39.4, '08', '安装', 'INSTALL'],
]

function headline(ctx, t, [a, b, zh, en]) {
  if (t < a || t > b + 0.4) return
  const inP = tw(t, a, a + 0.55, E.outQuint)
  const outP = tw(t, b, b + 0.35, E.inCubic)
  const x = 120
  const y = 930
  // a mask that the words rise through and leave by
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y - 110, W, 132)
  ctx.clip()
  text(ctx, zh, x, y + (1 - inP) * 120 - outP * 130, F.black(76), FG)
  ctx.restore()
  ctx.save()
  ctx.beginPath()
  ctx.rect(0, y + 22, W, 64)
  ctx.clip()
  text(ctx, en, x + 4, y + 66 + (1 - tw(t, a + 0.12, a + 0.7, E.outQuint)) * 60 - outP * 70, F.serif(40), DIM)
  ctx.restore()
  // accent bar
  ctx.fillStyle = BLUE
  ctx.fillRect(x, y - 132, 64 * inP * (1 - outP), 5)
}

function statusChip(ctx, t) {
  if (t < 15.0 || t > 21.6) return
  const { expired, amber } = cacheState(t)
  const [zh, en, col] = expired
    ? ['已过期', 'EXPIRED', RED]
    : amber
      ? ['最后一分钟', 'LAST MINUTE', AMBER]
      : t >= 20.2
        ? ['新请求 · 已续上', 'REFRESHED', BLUE]
        : t >= 16.0 && t < 18.2
          ? ['时间推移', 'TIME-LAPSE', DIM]
          : ['实时', 'LIVE', BLUE]
  const a = tw(t, 15.0, 15.4) * (1 - tw(t, 21.3, 21.6))
  ctx.save()
  ctx.globalAlpha = a
  const w = measure(ctx, zh, F.med(26)) + measure(ctx, en, F.mono(18)) + 80
  const x = W - 120 - w
  const y = 110
  roundRect(ctx, x, y, w, 50, 25)
  ctx.fillStyle = rgba(col === DIM ? '#8c8780' : col, 0.16)
  ctx.fill()
  ctx.beginPath()
  ctx.arc(x + 26, y + 25, 6, 0, TAU)
  ctx.fillStyle = col
  ctx.fill()
  text(ctx, zh, x + 44, y + 34, F.med(26), col === DIM ? FG : col)
  text(ctx, en, x + 56 + measure(ctx, zh, F.med(26)), y + 33, F.mono(18), DIM)
  ctx.restore()
}

export function drawHud(ctx, t, frame) {
  HEADS.forEach(h => headline(ctx, t, h))
  statusChip(ctx, t)
  // instrument marks
  const a = tw(t, 0.3, 1.0) * (1 - tw(t, 45.6, 46.0)) * 0.6
  if (a <= 0) return
  ctx.save()
  ctx.globalAlpha = a
  ctx.strokeStyle = rgba(FG, 0.4)
  ctx.lineWidth = 1.5
  const m = 40
  const l = 18
  for (const [x, y, sx, sy] of [[m, m, 1, 1], [W - m, m, -1, 1], [m, H - m, 1, -1], [W - m, H - m, -1, -1]]) {
    ctx.beginPath()
    ctx.moveTo(x, y + sy * l)
    ctx.lineTo(x, y)
    ctx.lineTo(x + sx * l, y)
    ctx.stroke()
  }
  let i = 0
  while (i + 1 < CHAPTERS.length && t >= CHAPTERS[i + 1][0]) i++
  const [c0, num, zh, en] = CHAPTERS[i]
  const sw = prog(t, c0, c0 + 0.45)
  text(ctx, num, 76, 84, F.monoB(19), BLUE)
  reveal(ctx, zh, 112, 84, F.med(19), FG, sw, { dy: 8, blur: 4, spread: 2 })
  reveal(ctx, en, 112 + measure(ctx, zh, F.med(19)) + 14, 84, F.mono(16), DIM, sw, { dy: 8, blur: 4, spread: 4 })
  text(ctx, 'USAGE-LINE  ·  FOR CLAUDE CODE', W - 76, 84, F.mono(16), DIM, { align: 'right' })
  const tc = `${String(Math.floor(frame / 60 / 60)).padStart(2, '0')}:${String(Math.floor(frame / 60) % 60).padStart(2, '0')}:${String(frame % 60).padStart(2, '0')}`
  text(ctx, tc, W - 76, H - 64, F.mono(16), DIM, { align: 'right' })
  ring(ctx, 84, H - 70, 6, 2.2, clamp(t / 46), BLUE)
  text(ctx, 'v1.0', 100, H - 64, F.mono(16), DIM)
  ctx.restore()
}

// Exposure, lens aberration and the closing fade.
export function look(t) {
  const hit = DROPS.reduce((m, d) => Math.max(m, t >= d ? Math.exp(-(t - d) * 6) : 0), 0)
  const expire = t >= 19.4 && t < 20.4 ? Math.exp(-(t - 19.4) * 3) : 0
  const clearHit = t >= 32.55 ? Math.exp(-(t - 32.55) * 6) : 0
  return {
    ca: 0.002 + hit * 0.008 + expire * 0.02 + clearHit * 0.01,
    exposure: 1 + hit * 0.25,
    fade: (1 - tw(t, 50.9, 52, E.inOutSine)) * tw(t, 0, 0.35),
  }
}
