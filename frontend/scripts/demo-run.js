// Plays the README §14 two-minute script in MOCK mode and logs GW_SHOT:<beat> so scripts/shot.mjs
// saves one screenshot per beat. Run: npm run dev:mock, then npm run rehearse (images land in rehearsal/).
// Uses the mock rehearsal panel to play Anson (pour, touch), Aashita (storm replay) and Rithika (phone report).
(async () => {
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const shot = async (name) => { console.log('GW_SHOT:' + name); await wait(900) }
  const key = (k, extra = {}) => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, ...extra }))
  const button = (root, text) => [...root.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(text))
  const mock = async (label) => {
    window.dispatchEvent(new Event('gw:toggle-mock-controls')); await wait(250)
    button(document.querySelector('aside'), label).click()
    window.dispatchEvent(new Event('gw:toggle-mock-controls')); await wait(200)
  }
  const t0 = performance.now()
  // 0:00 Rishi: the map
  key('1'); await wait(2500); await shot('01-map')
  // 0:10 Anson pours water: the demo tray climbs, beacon (heavy truck) turns amber
  key('2'); await wait(1500); await mock('Pour water'); await wait(9000); await shot('02-pour-pickup')
  // 0:30 the judge switches to Heavy truck
  ;[...document.querySelectorAll('[role=radio]')].find((b) => b.textContent.includes('Heavy truck')).click(); await wait(2000); await shot('03-heavy-truck')
  ;[...document.querySelectorAll('h2')].find((h) => h.textContent.includes('Mats and cost')).closest('section').scrollIntoView({ block: 'start' }); await wait(1500); await shot('04-mats-cost')
  // 0:55 Aashita starts the storm replay from her laptop (server-side)
  key('3'); await wait(1500); await mock('Start'); await wait(2500); await shot('05-stop-takeover')
  await wait(5000); await shot('06-stop-alarm')
  // the judge taps the beacon
  await mock('Touch (ack)'); await wait(2500); await shot('07-ack')
  // 1:25 Rithika sends a crew report from the phone
  history.pushState({}, '', '/report/DEMO-TRAY'); await wait(1500)
  const canvas = Object.assign(document.createElement('canvas'), { width: 1600, height: 1200 })
  const c = canvas.getContext('2d'); c.fillStyle = '#5b6b4f'; c.fillRect(0, 0, 1600, 1200); c.fillStyle = '#7fa0be'; c.beginPath(); c.ellipse(800, 900, 600, 160, 0, 0, 7); c.fill()
  const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.9))
  const dt = new DataTransfer(); dt.items.add(new File([blob], 'water.jpg', { type: 'image/jpeg' }))
  const input = document.getElementById('report-photo'); input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true })); await wait(1200)
  ;[...document.querySelectorAll('[role=radio]')].find((b) => b.textContent.includes('Standing water')).click()
  const ta = document.querySelector('textarea')
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(ta, 'Standing water near the southern gate')
  ta.dispatchEvent(new Event('input', { bubbles: true })); await wait(300)
  document.querySelector('button[type=submit]').click(); await wait(2000)
  key('1'); await wait(3000); await shot('08-report-pin')
  // 1:45 Rithika opens the 6 PM briefing
  key('5'); await wait(1500); button(document, 'Generate').click(); await wait(2500); await shot('09-briefing')
  // Between groups: Rishi's hidden reset
  key('‰', { code: 'KeyR', altKey: true, shiftKey: true }); await wait(700)
  button(document.querySelector('[role=dialog]'), 'Reset demo').click(); await wait(3500); await shot('10-after-reset')
  console.log('demo run seconds', Math.round((performance.now() - t0) / 1000))
})()
