// usage-line — the trailer. The film is a WebGL program (src/); this drives it.
//
// A local server hands the page its files, headless Chrome renders each frame on the GPU,
// and the page streams raw pixels back over a WebSocket into ffmpeg. Frames are split across
// several pages, then joined with the score.
//
//   node render.mjs                    the film → out/usage-line-trailer.mp4
//   node render.mjs --still 9.5,16     single frames → out/stills/
//   JOBS=4 node render.mjs             pages in parallel (default 4)
import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'
import { WebSocketServer } from 'ws'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'out')
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const W = 1920
const H = 1080
const FPS = 60

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.ttf': 'font/ttf', '.json': 'application/json', '.png': 'image/png' }

function serve() {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    const file = path.join(HERE, url === '/' ? 'index.html' : url)
    if (!file.startsWith(HERE) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      res.writeHead(404)
      return res.end()
    }
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] ?? 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  })
  const wss = new WebSocketServer({ server })
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, wss, port: server.address().port })))
}

function ffmpeg(args) {
  return spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: ['pipe', 'inherit', 'inherit'] })
}

async function launch() {
  return puppeteer.launch({
    executablePath: CHROME,
    headless: true,
    args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader=false', `--window-size=${W},${H}`, '--disable-background-timer-throttling', '--disable-renderer-backgrounding'],
    defaultViewport: { width: W, height: H, deviceScaleFactor: 1 },
    protocolTimeout: 0,
  })
}

// One page: it connects back over the socket, and each rendered frame arrives as one message.
async function openPage(browser, port, wss, id) {
  const page = await browser.newPage()
  page.on('console', m => {
    if (m.type() === 'error' || m.text().startsWith('[film]')) console.log(`  page ${id}:`, m.text())
  })
  page.on('pageerror', e => console.log(`  page ${id} error:`, e.message))
  const socket = new Promise(r => wss.once('connection', ws => r(ws)))
  await page.goto(`http://127.0.0.1:${port}/index.html?id=${id}&mod=${process.env.MOD || "shots"}&look=${process.env.LOOK || ""}&tr=${process.env.TR || ""}`)
  const ws = await socket
  await page.waitForFunction('window.filmReady === true', { timeout: 120000 })
  let waiting = null
  ws.on('message', data => {
    const w = waiting
    waiting = null
    w?.(data)
  })
  return {
    page,
    async frame(f) {
      const got = new Promise(r => (waiting = r))
      await page.evaluate(n => window.renderFrame(n), f)
      return got
    },
  }
}

async function stills(times) {
  const { server, wss, port } = await serve()
  const browser = await launch()
  const p = await openPage(browser, port, wss, 0)
  fs.mkdirSync(path.join(OUT, 'stills'), { recursive: true })
  for (const ts of times) {
    const t0 = Date.now()
    const buf = await p.frame(Math.round(Number(ts) * FPS))
    const file = path.join(OUT, 'stills', `${Number(ts).toFixed(2)}.png`)
    const ff = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-i', '-', '-vf', 'vflip', '-frames:v', '1', file])
    ff.stdin.end(buf)
    await new Promise(r => ff.on('close', r))
    console.log(`  ${file.split('/').pop()}  ${Date.now() - t0}ms`)
  }
  await browser.close()
  server.close()
}

async function film() {
  const DUR = Number(process.env.DUR) || (await import('./src/timeline.js')).DUR
  const START = Math.round((Number(process.env.START) || 0) * FPS) // a clip: frames START..DUR
  const total = Math.round(DUR * FPS) - START
  const jobs = Number(process.env.JOBS || 4)
  const { server, wss, port } = await serve()
  const browser = await launch()
  const pages = []
  for (let i = 0; i < jobs; i++) pages.push(await openPage(browser, port, wss, i))
  const size = Math.ceil(total / jobs)
  const files = []
  let done = 0
  const t0 = Date.now()
  fs.mkdirSync(OUT, { recursive: true })
  await Promise.all(
    pages.map(async (p, i) => {
      const a = START + i * size
      const b = Math.min(START + total, a + size)
      const file = path.join(OUT, `chunk-${String(i).padStart(2, '0')}.mkv`)
      files[i] = file
      const ff = ffmpeg(['-f', 'rawvideo', '-pix_fmt', 'rgba', '-s', `${W}x${H}`, '-r', String(FPS), '-i', '-', '-vf', 'vflip', '-c:v', 'libx264rgb', '-qp', '0', '-preset', 'ultrafast', file])
      for (let f = a; f < b; f++) {
        const buf = await p.frame(f)
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r))
        done++
        if (done % 20 === 0) {
          const s = (Date.now() - t0) / 1000
          process.stdout.write(`\r  ${done}/${total} frames  ${s.toFixed(0)}s  eta ${((s / done) * (total - done)).toFixed(0)}s   `)
        }
      }
      ff.stdin.end()
      await new Promise(r => ff.on('close', r))
    }),
  )
  process.stdout.write('\n')
  await browser.close()
  server.close()
  fs.writeFileSync(path.join(OUT, 'chunks.txt'), files.map(f => `file '${f}'`).join('\n'))
  const audio = process.env.AUDIO || path.join(OUT, 'score.wav')
  const final = path.join(OUT, `${process.env.NAME || 'usage-line-trailer'}.mp4`)
  const enc = ffmpeg([
    '-f', 'concat', '-safe', '0', '-i', path.join(OUT, 'chunks.txt'),
    ...(fs.existsSync(audio) ? ['-ss', String(START / FPS), '-i', audio] : []),
    '-vf', 'noise=c0s=4:c0f=t+u,format=yuv420p',
    '-c:v', 'libx264', '-preset', 'slow', '-crf', '16', '-tune', 'film', '-x264-params', 'aq-mode=3',
    '-colorspace', 'bt709', '-color_primaries', 'bt709', '-color_trc', 'bt709',
    ...(fs.existsSync(audio) ? ['-c:a', 'aac', '-b:a', '256k', '-shortest'] : []),
    '-movflags', '+faststart', final,
  ])
  await new Promise((res, rej) => enc.on('close', c => (c === 0 ? res() : rej(new Error(`encode ${c}`)))))
  console.log(`  → ${final}  (${((Date.now() - t0) / 1000).toFixed(0)}s)`)
}

const args = process.argv.slice(2)
;(args[0] === '--still' ? stills(args[1].split(',')) : film()).catch(e => {
  console.error(e)
  process.exit(1)
})
