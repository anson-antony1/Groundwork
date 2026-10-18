# Groundwork: 3-minute expo demo

**Expo:** Sun Oct 18, 10 AM–12 PM, REI Grand Ballroom. About 3 minutes per judge group, at least 3 groups.
**Goal:** a person and a problem in 15 seconds, it working live by 0:45, one validation number, and a clean handoff every beat.
**Rule:** everyone demos what they built, so every answer comes from the person who knows it best.

| Who | Built | Demos | Talk time |
|---|---|---|---|
| **Rishi** | Frontend | Opening, the map and its legend, vehicle switch, crew report pin, close | ~55 s |
| **Anson** | Hardware and sensors | Beacon and soil probe, judge's tap, lightning countdown on the beacon | ~45 s |
| **Aashita** | Backend and APIs | Mats and cost numbers, storm replay, the rules behind STOP WORK | ~45 s |
| **Rithika** | ML, briefing, MCP and Claude, n8n email | Learned forecast, 6 PM brief, email button | ~55 s |

---

## Before each judge group (60 s reset)

- [ ] Weather is fresh: no "stale" tag on a site page. If stale, run `python -m backend.scripts.refresh_weather_loop_v2 --once` (4–5 min, so do it before 9:30).
- [ ] **Reset demo** pressed (clears replay, reports, acknowledgments; re-arms the beacon).
- [ ] Map on screen, vehicle set to **Pickup** (the judge switches it).
- [ ] Beacon green, probe in the **dry corner**; damp patch reads **40–60**.
- [ ] Rishi's phone: report form open on **DEMO-TRAY**, category **Lightning observed**.
- [ ] A Florida site page open in a second tab (e.g. SITE-001) with the **Learned forecast** box visible.
- [ ] n8n running with the workflow **Active** (only if the email beat is in; skip it otherwise).
- [ ] Do Not Disturb on every laptop and phone.

---

## The script

Quotes are what to say. Keep the order and timing; the wording can be your own. About 2.5 words per second.

### 0:00–0:20 · Rishi · The problem, on the map
**Do:** stand beside the map. Point at the legend, then the ranked list.

> "It's 6 PM. A utility supervisor has 300 job sites tomorrow and a week of rain behind them. One wrong call and a heavy truck sinks to its axles, or you pay to haul mats nobody needed. This map is tomorrow: each pin's color is its call, the list is ranked most urgent first, and every site shows where its data came from."

### 0:20–0:45 · Anson · Real soil, real loop
**Do:** move the probe from the dry corner to the damp patch. Point at the beacon as it turns amber.

> "This is our site beacon: an Arduino with a soil-moisture, light and pressure sensor. I'll move the probe into wet ground. The reading goes to our server over USB, the server re-scores the site, and the beacon turns amber: mats for review. The Arduino never decides; it shows the server's call."

### 0:45–1:00 · Rishi · Same ground, different vehicle
**Do:** hand the judge the mouse: "Switch it to heavy truck." Point at the pins that change.

> "Go ahead, switch it to heavy truck. Same ground, different vehicle: watch the pins change. The pickup is fine, the heavy truck needs mats."

### 1:00–1:15 · Aashita · Mats and cost
**Do:** open the demo site; scroll to the mats and cost cards.

> "Our backend sizes it: about 42 to 48 mats on a 100-foot route, and mats versus postponing the job side by side. Every cost is editable, because these are planning assumptions, not quotes."

*Read the mat range off the screen if the route settings were changed.*

### 1:15–1:40 · Aashita (Anson guides the tap) · A real storm
**Do:** click **Storm Replay** (Hurricane Milton). The beacon turns red and buzzes. Anson invites the judge to tap it. Aashita **stops the replay** at the end of the beat (lightning reports are ignored during a replay).

> **Aashita:** "Now Hurricane Milton, October 2024, replayed through the same API with the real weather and the real Weather Service warnings from that day. All 60 Florida sites go to STOP WORK, even with mats staged. Safety always overrides access."
>
> **Anson:** "Tap the beacon. That records that the crew saw the alarm. It doesn't clear STOP WORK."

### 1:40–2:00 · Rishi, then Anson · Lightning, Sperry's rule
**Do:** Rishi submits the **Lightning observed** report from the phone and points at the new pin; the beacon counts down from `STOP - CLR 30:00`.

> **Rishi:** "A crew member reports lightning from their phone. It pins to the map, marked unverified until a supervisor reviews it."
>
> **Anson:** "It's within 10 miles, so the site stops work with a 30-minute all-clear, and every new strike restarts the countdown, exactly as Sperry's brief asks."

### 2:00–2:35 · Rithika · The learned forecast
**Do:** switch to the Florida site tab and point at the **Learned forecast · advisory** box.

> "Sperry asked for a hazard index learned from history, so I trained one: three years of archived forecasts and real Weather Service alerts at all 300 sites, tested on a year it never saw. It ranks STOP-WORK days better than our own rules, 0.85 versus 0.78. In Florida it only ties, because summer storms hit almost every afternoon, so it stays advisory: it shows the probability and what drove it, and the rules still decide."

### 2:35–2:55 · Rithika · Tonight's plan, delivered
**Do:** open **6 PM Brief**. If n8n is up, click **Email this plan**.

> "At 6 PM the supervisor gets this: every site ranked, every number traced to its source. Gemini writes the summary from facts the rules computed, and it falls back to a template if the AI is down. An n8n workflow emails it every evening, and through our MCP server a supervisor can ask Claude follow-up questions against the live API."

### 2:55–3:00 · Rishi · Close
> "That's Groundwork. Happy to go deeper on anything."

**Stop at 3:00.** Let the judges ask.

---

## If something breaks (say it and keep going)

| Problem | Who | Do and say |
|---|---|---|
| Beacon or USB fails | Anson | Unplugged, it shows `NO LINK` within 6 s. Run `python scripts/replay_sensor_v2.py --loop --interval 2 --token dev-sensor-token`: "The USB link dropped, so this is a simulated sequence standing in for the beacon, labeled Recorded demo." |
| Probe skips MATS and goes straight to NO GO | Anson | "Even wetter: now it's NO GO for the heavy truck." Then move back to the damp patch. |
| A page errors or loads slowly | Aashita | Show `http://localhost:8000/docs`: "Every screen sits on a documented API; here's the call." |
| Site page shows "stale" weather | Aashita | "Data older than 6 hours reads UNKNOWN rather than old." Refresh between groups. |
| Learned forecast box missing | Rithika | It hides when weather is stale or an input is missing. Show `backend/ml/EVALUATION.md` instead. |
| Gemini slow or offline | Rithika | Show the saved briefing; the template summary works with no AI. |
| n8n not running | Rithika | Skip the click: "n8n sends this at 6 PM; here's the email it sent earlier." Have one open in Gmail. |
| Wi-Fi down | Anyone | The API reads a saved snapshot and the Florida map works offline: "It keeps working when a data source is down." |

---

## Say these labels out loud (they win trust)

- Sites are **real OpenStreetMap substations**, not confirmed work orders.
- Thresholds are **demo policy**, configurable by a utility.
- Access calls are **for review**, not a soil-strength certification.
- Costs are **planning assumptions**, not quotes.
- Lightning is **crew-reported**, not a strike network.
- The Milton replay's weather and warnings are **real** (archived), just replayed.
- **Never claim** AI photo tagging, guaranteed savings or certified safety.

---

## Questions: who answers

| Question | Who | Short answer |
|---|---|---|
| "What do the colors and tags mean?" | Rishi | Walk the legend: status colors, the per-vehicle call, and the data-mode tag (live, cached, replay, sensor demo) on every site. |
| "Is it usable on a phone in the field?" | Rishi | "The report form and site pages work on a phone over the LAN; that's how the lightning report came in." |
| "Why Arduino, not a Pi?" | Anson | "The Uno has analog inputs for moisture and light, and USB keeps the demo independent of venue Wi-Fi." |
| "What if the beacon disconnects?" | Anson | "`NO LINK` within 6 seconds. It never shows green on stale data." |
| "How is the sensor calibrated?" | Anson | Dry and wet reference readings mapped to a 0–100 index (`hardware/calibration.json`). |
| "Can mats override lightning?" | Aashita | "Never. STOP WORK beats every access call, in the code and in the tests." |
| "How do you know the data is real?" | Aashita | "Every number has its source and fetch time, and we count coverage: soil for 255 of 300 sites, the rest show UNKNOWN." |
| "How would you deploy and secure it?" | Aashita | "FastAPI on Render; Auth0 roles checked on the backend; sensor writes need a token; no secrets in the repo; a saved snapshot keeps the plan alive when an API is down." |
| "Isn't your ML just rules?" | Rithika | "The safety engine is rules on purpose. Next to it is a trained model, tested on a held-out year: 0.85 vs 0.78. It ties in Florida, so it stays advisory." |
| "Why logistic regression?" | Rithika | "Gradient boosting was 0.01 higher on AUC but worse on precision and calibration. Logistic regression explains each prediction as named factors, gives honest probabilities, and runs in the API with no extra libraries." |
| "How did you split the data?" | Rithika | "By time, never shuffled: trained July 2023 to June 2025, tuned on the last six months of that, tested on July 2025 to June 2026." |
| "Why doesn't it predict GO / NO GO?" | Rithika | "There's no history of trucks getting stuck to learn from; training on our own rule's output would just copy the rules. With crews logging 'got stuck' or 'mats were fine', that's the next model." |
| "What does Claude / MCP add?" | Rithika | "Our MCP server exposes the live API as tools, so a supervisor can ask Claude Desktop 'which Florida sites are STOP WORK?' and get answers from real data. It reads; it never sets a status." |
| "Perry Weather already does lightning." | Rishi | "Agreed, and we'd plug it in. Our contribution is the per-vehicle access and mats call for tomorrow." |
| "Who pays?" | Rishi | "Utility operations teams (fewer stuck trucks, fewer wasted mat hauls) and mat vendors (demand for overnight staging)." |

---

## Five-minute deep dives (if a judge has time)

| Judge | Who leads | Show |
|---|---|---|
| **Sperry** | Rithika, Aashita | Every line of their brief; the mats call; the held-out scores, including where it only ties |
| **AI track** | Rithika | `backend/ml/EVALUATION.md`; the Gemini number check and fallback; Claude Desktop asking the MCP server a live question |
| **Hardware** | Anson | Unplug the USB live (`NO LINK`), the wiring, the serial protocol |
| **Easy On The Eyes** | Rishi | Map, legend, site page, beacon mirror, print view |
| **Security / backend engineers** | Aashita | `/docs`, Auth0 roles, token-protected sensor writes, the tests |
| **NextEra / FPL** | Rithika | "Your crews, tomorrow morning"; mention the FPL internship |

**30-second version** (busy judge): Rishi's opening line → Anson's probe turns the beacon amber → Aashita's storm replay alarms the beacon → Rithika: "and a model trained on three years of storms, tested on a year it never saw." → Rishi: "Want the full three minutes?"
