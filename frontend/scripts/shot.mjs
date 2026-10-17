// Screenshot a page at an exact viewport through Chrome's DevTools protocol.
// Plain `chrome --headless --screenshot` can't go below 500 px wide or emulate browser zoom; this can.
//
//   node scripts/shot.mjs <url> <out.png> [--size 1920x1080] [--scale 1.25] [--mobile] [--full] [--wait 2500]
//
// --scale emulates browser zoom (1440x900 at 125% zoom ≈ --size 1152x720 --scale 1.25).
// --mobile emulates a touch phone. --full captures the whole page height.
// Set CHROME=/path/to/chrome if Chrome isn't in the default macOS location.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const args = process.argv.slice(2)
const [url, out] = args.filter((a, i) => !a.startsWith('--') && !args[i - 1]?.match(/^--(size|scale|wait)$/))
if (!url || !out) {
  console.error('usage: node scripts/shot.mjs <url> <out.png> [--size WxH] [--scale N] [--mobile] [--full] [--wait ms]')
  process.exit(2)
}
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 ? args[i + 1] : fallback
}
const [width, height] = opt('size', '1920x1080').split('x').map(Number)
const scale = Number(opt('scale', '1'))
const waitMs = Number(opt('wait', '2500'))
const mobile = args.includes('--mobile')
const full = args.includes('--full')

const CHROME = process.env.CHROME ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const port = 9300 + Math.floor(Math.random() * 500)
const profile = mkdtempSync(join(tmpdir(), 'gw-shot-'))
const chrome = spawn(CHROME, [
  '--headless=new',
  '--disable-gpu',
  '--hide-scrollbars',
  '--no-first-run',
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  'about:blank',
])

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function pageTarget() {
  for (let i = 0; i < 100; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()
      const page = list.find((t) => t.type === 'page')
      if (page) return page.webSocketDebuggerUrl
    } catch {
      // Chrome not listening yet.
    }
    await sleep(100)
  }
  throw new Error('Chrome did not start')
}

try {
  const ws = new WebSocket(await pageTarget())
  await new Promise((resolve, reject) => {
    ws.onopen = resolve
    ws.onerror = reject
  })
  let nextId = 1
  const pending = new Map()
  const events = []
  ws.onmessage = (msg) => {
    const data = JSON.parse(msg.data)
    if (data.id && pending.has(data.id)) {
      pending.get(data.id)(data)
      pending.delete(data.id)
    } else if (data.method) events.push(data.method)
  }
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const id = nextId++
      pending.set(id, (d) => (d.error ? reject(new Error(`${method}: ${d.error.message}`)) : resolve(d.result)))
      ws.send(JSON.stringify({ id, method, params }))
    })

  await send('Page.enable')
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: scale, mobile })
  if (mobile) await send('Emulation.setTouchEmulationEnabled', { enabled: true })
  await send('Page.navigate', { url })
  for (let i = 0; i < 100 && !events.includes('Page.loadEventFired'); i++) await sleep(100)
  await sleep(waitMs)

  let clip
  if (full) {
    const { cssContentSize } = await send('Page.getLayoutMetrics')
    clip = { x: 0, y: 0, width, height: Math.ceil(cssContentSize.height), scale: 1 }
  }
  const { data } = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: full, ...(clip && { clip }) })
  writeFileSync(out, Buffer.from(data, 'base64'))
  console.log(`saved ${out} (${width}x${height} @${scale}x${mobile ? ' mobile' : ''}${full ? ' full page' : ''})`)
  ws.close()
} finally {
  chrome.kill()
  await sleep(200)
  rmSync(profile, { recursive: true, force: true })
}
