// The film, v2: the 44 s film in real perspective. What every shot stands on: a warm graphite
// studio with a dot grid far behind (it gives the camera parallax), a screen-locked type layer,
// soft contact shadows, and an orbiting camera.
import * as THREE from 'three'
import { H, W, makeShot } from './engine.js'
import { UNIT, dist, ground, panel, shoot, typeLayer } from './kit.js'
import { canvasTexture, FG } from './ui.js'

export const FOV = 30
export const D = dist(FOV)
// screen px on the z = 0 plane → world units (also used for a group's local px)
export const at = (px, py) => [(px - W / 2) / UNIT, (H / 2 - py) / UNIT]

export const WARM = { base: '#0f0e0d', blobs: [{ c: '#0b1220', x: 0.5, y: 0.5, r: 0.55, a: 1 }, { c: '#100e0b', x: 0.15, y: 0.95, r: 0.5, a: 1 }] }

function dots() {
  const ct = canvasTexture(64, 64)
  ct.draw(0, ctx => {
    ctx.fillStyle = FG
    ctx.beginPath()
    ctx.arc(32, 32, 2.6, 0, Math.PI * 2)
    ctx.fill()
  })
  ct.tex.wrapS = ct.tex.wrapT = THREE.RepeatWrapping
  const Wd = 96
  const Hd = 60
  ct.tex.repeat.set(Wd / 0.74, Hd / 0.74)
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(Wd, Hd),
    new THREE.MeshBasicMaterial({ map: ct.tex, transparent: true, opacity: 0.11, depthWrite: false, depthTest: false, toneMapped: false }),
  )
  m.position.z = -10
  m.renderOrder = -900
  return m
}

export function world() {
  const s = makeShot()
  const bg = ground(s.scene, { warp: 0.03, ...WARM })
  const grid = dots()
  s.scene.add(grid)
  const front = typeLayer(s.scene)
  return { s, bg, grid, front }
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
