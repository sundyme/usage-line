// The film, v2: the 44 s film in real perspective. What every shot stands on: a warm graphite
// studio with a dot grid far behind (it gives the camera parallax), a screen-locked type layer,
// soft contact shadows, and an orbiting camera.
import * as THREE from 'three'
import { H, W, makeShot } from './engine.js'
import { UNIT, dist, glow, ground, panel, shoot, typeLayer } from './kit.js'
import { canvasTexture, FG } from './ui.js'

export const FOV = 30
export const D = dist(FOV)
// screen px on the z = 0 plane → world units (also used for a group's local px)
// numbers change once per frame, never mid-shutter: a smeared figure reads as two
export const snap = t => Math.round(t * 60) / 60

export const at = (px, py) => [(px - W / 2) / UNIT, (H / 2 - py) / UNIT]

// Looks, chosen by ?look=; 'black' (A) is the film's. 'now' is v2.1 as shipped; the others were the candidates.
const LOOKS = {
  now: {
    base: '#121318', warp: 0.03, grid: 0.07, aura: ['#5b7fd6', 0.09],
    blobs: [{ c: '#2b303b', x: 0.5, y: 1.02, r: 0.66, a: 1 }, { c: '#10203f', x: 0.14, y: 0.16, r: 0.5, a: 1 }, { c: '#221c15', x: 0.9, y: 0.2, r: 0.46, a: 0.9 }],
    tint: { blue: '#10203f', amber: '#3a2609', red: '#3a1210' },
  },
  // A · black stage, one soft key light from above; nothing behind the subject competes with it
  black: {
    base: '#050506', warp: 0, grid: 0.03, aura: ['#9aa3b5', 0.025],
    blobs: [{ c: '#1c1d21', x: 0.5, y: 1.1, r: 0.62, a: 1 }],
    tint: { blue: '#08101f', amber: '#1c1305', red: '#1f0908' },
  },
  // B · neutral graphite, a smooth top-to-bottom falloff with no hue, so every colour in the UI is the only colour
  graphite: {
    base: '#0b0b0c', warp: 0, grid: 0.045, aura: ['#a0a0a0', 0.03],
    blobs: [{ c: '#25262a', x: 0.5, y: 1.25, r: 0.95, a: 1 }, { c: '#0e0e10', x: 0.5, y: 0.5, r: 0.5, a: 0.6 }],
    tint: { blue: '#0a1222', amber: '#1d1406', red: '#200a09' },
  },
  // C · cool edges, a neutral pool of light behind the subject: the content sits on a halo
  halo: {
    base: '#07080c', warp: 0.015, grid: 0.03, aura: ['#c9c2b4', 0.035],
    blobs: [{ c: '#0d1a36', x: 0.04, y: 0.05, r: 0.45, a: 1 }, { c: '#0d1a36', x: 0.98, y: 0.98, r: 0.4, a: 0.8 }, { c: '#26241f', x: 0.5, y: 0.52, r: 0.36, a: 1 }],
    tint: { blue: '#0b1630', amber: '#2a1c07', red: '#2a0c0b' },
  },
}
export const LOOK = LOOKS[new URLSearchParams(globalThis.location?.search || '').get('look') || 'black'] || LOOKS.black
export const STUDIO = LOOK.blobs
export const BASE = LOOK.base
export const GRID = LOOK.grid
export const LIFT = LOOK !== LOOKS.now

// Light from above on a window's edge: a rim that is bright on top and fades down, and a faint sheen
// over the title bar, so a dark window reads as an object against a dark stage.
export function edge(ctx, x, y, w, h, r) {
  if (!LIFT) return
  ctx.save()
  const g = ctx.createLinearGradient(0, y, 0, y + h)
  g.addColorStop(0, 'rgba(255,255,255,0.34)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.1)')
  g.addColorStop(1, 'rgba(255,255,255,0.05)')
  ctx.strokeStyle = g
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.roundRect(x + 1, y + 1, w - 2, h - 2, r)
  ctx.stroke()
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
  ctx.clip()
  const sh = ctx.createLinearGradient(0, y, 0, y + Math.min(160, h * 0.4))
  sh.addColorStop(0, 'rgba(255,255,255,0.045)')
  sh.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = sh
  ctx.fillRect(x, y, w, Math.min(160, h * 0.4))
  ctx.restore()
}

function dots() {
  const ct = canvasTexture(64, 64)
  ct.draw(0, ctx => {
    ctx.fillStyle = FG
    ctx.beginPath()
    ctx.arc(32, 32, 2.2, 0, Math.PI * 2)
    ctx.fill()
  })
  ct.tex.wrapS = ct.tex.wrapT = THREE.RepeatWrapping
  const Wd = 96
  const Hd = 60
  ct.tex.repeat.set(Wd / 0.62, Hd / 0.62)
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(Wd, Hd),
    new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, opacity: LOOK.grid, depthWrite: false, depthTest: false, toneMapped: false }),
  )
  m.position.z = -10
  m.renderOrder = -900
  return m
}

export function world() {
  const s = makeShot()
  const bg = ground(s.scene, { warp: LOOK.warp, base: BASE, blobs: STUDIO })
  const grid = dots()
  const aura = glow(36, LOOK.aura[0], LOOK.aura[1])
  aura.position.set(0, 2, -7)
  aura.renderOrder = -950
  s.scene.add(aura, grid)
  const front = typeLayer(s.scene)
  return { s, bg, grid, front, aura }
}

// A camera on a sphere around its target: yaw and pitch in radians, distance in units of D.
export function orbit(camera, t, tgt, { dist: k = 1, yaw = 0, pitch = 0, drift = 0.012, roll = 0, shake = 0 } = {}) {
  const d = D * k
  const pos = [tgt[0] + d * Math.sin(yaw) * Math.cos(pitch), tgt[1] + d * Math.sin(pitch), (tgt[2] ?? 0) + d * Math.cos(yaw) * Math.cos(pitch)]
  shoot(camera, t, pos, [tgt[0], tgt[1], tgt[2] ?? 0], FOV, { drift, roll, shake })
  camera.updateMatrixWorld(true) // so projections this sub-frame use this camera, not the last
}

// A soft contact shadow for a w × h card, drawn once; scale and opacity follow its height.
export function shadow(w, h, r = 18, { blur = 26, k = 0.85 } = {}) {
  const m = 90
  const p = panel(w + m * 2, h + m * 2, { res: 0.5 })
  p.userData.draw(0, ctx => {
    ctx.filter = `blur(${blur}px)`
    ctx.fillStyle = `rgba(0,0,0,${k})`
    ctx.beginPath()
    ctx.roundRect(m, m, w, h, r)
    ctx.fill()
  })
  return p
}

export function rr(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, r)
}

export { panel, UNIT }
