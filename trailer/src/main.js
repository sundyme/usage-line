// Boot: fonts first (every texture is drawn with them), then the world, then the socket the
// frames leave by. render.mjs calls window.renderFrame(n) for each frame.
const FAMILIES = ['SC Light', 'SC Regular', 'SC Medium', 'SC Black', 'Mono', 'Mono SemiBold', 'Serif Italic']
await Promise.all(FAMILIES.map(f => document.fonts.load(`40px "${f}"`, '缓存0aA')))

const { renderFrame } = await import('./engine.js')
const { buildShots, drawHud, look } = await import('./shots.js')
const { plan } = buildShots()

const ws = new WebSocket(`ws://${location.host}`)
ws.binaryType = 'arraybuffer'
await new Promise(r => ws.addEventListener('open', r, { once: true }))

const SAMPLES = Number(new URLSearchParams(location.search).get('samples') || 8)
window.renderFrame = async n => {
  const px = renderFrame(n, { samples: SAMPLES, shutter: 0.5, plan, drawHud, look })
  ws.send(px)
  while (ws.bufferedAmount > 0) await new Promise(r => setTimeout(r, 1))
}
window.filmReady = true
console.log('[film] ready')
