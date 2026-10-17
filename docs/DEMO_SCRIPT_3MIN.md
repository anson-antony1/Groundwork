# Groundwork: 3-minute expo demo

**Expo:** Sun Oct 18, 10 AM–12 PM, REI Grand Ballroom. About 3 minutes per judge group, at least 3 groups.
**Goal:** a person and a problem in 15 seconds, it working live by 0:40, one validation number, and a clean handoff every beat.

| Who | Owns | Talk time |
|---|---|---|
| **Rishi** | Opening, vehicle switch and mats, close | ~50 s |
| **Anson** | Beacon and soil tray, judge's tap, lightning countdown | ~45 s |
| **Aashita** | Storm replay, 6 PM brief and data trail | ~50 s |
| **Rithika** | Crew lightning report, learned forecast | ~45 s |

---

## Before each judge group (60 s reset)

- [ ] Weather is fresh: no "stale" tag on a site page. If stale, run `python -m backend.scripts.refresh_weather_loop_v2 --once` (4–5 min, so do it before 9:30).
- [ ] **Reset demo** pressed (clears replay, reports, acknowledgments; re-arms the beacon).
- [ ] Map on screen, vehicle set to **Pickup** (the judge switches it).
- [ ] Beacon green, probe in the **dry corner**; damp patch reads **40–60**.
- [ ] Rithika's phone: report form open on **DEMO-TRAY**, category **Lightning observed**.
- [ ] A Florida site page open in a second tab (e.g. SITE-001) with the **Learned forecast** box visible.
- [ ] Do Not Disturb on every laptop and phone.

---

## The script

Quotes are what to say. Keep the order and timing; the wording can be your own. About 2.5 words per second.

### 0:00–0:15 · Rishi · The problem
**Do:** stand beside the map, face the judges.

> "It's 6 PM. A utility supervisor has 300 job sites tomorrow and a week of rain behind them. One wrong call and a heavy truck sinks to its axles at a remote site, or you pay to haul mats nobody needed. Groundwork makes that call."

### 0:15–0:40 · Anson · Real soil, real loop
**Do:** move the probe from the dry corner to the damp patch. Point at the beacon as it turns amber.

> "This is our site beacon: an Arduino reading real soil. I'll move the probe into wet ground. The reading climbs, our server re-scores the site, and the beacon turns amber: mats for review. The Arduino never decides; it shows the server's call."

### 0:40–1:05 · Rishi · Same ground, different vehicle
**Do:** hand the judge the mouse: "Switch it to heavy truck." Open the demo site; scroll to the mats and cost cards.

> "Same ground, different vehicle. The pickup is fine, but the heavy truck needs about 42 to 48 mats on a 100-foot route. Here's mats versus postponing. Every cost is editable, because these are planning assumptions, not quotes."

*Read the mat range off the screen if the route settings were changed.*

### 1:05–1:35 · Aashita (Anson guides the tap) · A real storm
**Do:** click **Storm Replay** (Hurricane Milton). The beacon turns red and buzzes. Anson invites the judge to tap it. Aashita **stops the replay** at the end of the beat (lightning reports are ignored during a replay).

> **Aashita:** "Now a real storm: Hurricane Milton, October 2024, replayed with the real weather and the real Weather Service warnings from that day. All 60 Florida sites go to STOP WORK, even with mats staged, and Oregon doesn't. Safety always overrides access."
>
> **Anson:** "Go ahead, tap the beacon. That records that the crew saw the alarm. It doesn't clear STOP WORK; only the weather logic can."

### 1:35–1:55 · Rithika, then Anson · Lightning, Sperry's rule
**Do:** Rithika submits the **Lightning observed** report from her phone; the pin appears and the beacon counts down from `STOP - CLR 30:00`.

> **Rithika:** "A crew member at the venue reports lightning. It lands on the map, marked unverified until a supervisor reviews it."
>
> **Anson:** "It's within 10 miles, so the site stops work with a 30-minute all-clear, and every new strike restarts it, exactly as Sperry's brief asks. It's crew-reported, not a strike network."

### 1:55–2:30 · Rithika · The learned forecast
**Do:** switch to the Florida site tab and point at the **Learned forecast · advisory** box.

> "Sperry asked for a hazard index learned from history, so we trained one: three years of archived forecasts and real Weather Service alerts at all 300 sites. We tested it on a year it never saw. It ranks STOP-WORK days better than our own rules, 0.85 versus 0.78, and it beat a second model our team built on NOAA storm reports. In Florida it only ties the rules, because summer storms hit almost every afternoon. So it stays advisory: it shows the probability and why, and the rules still decide."

### 2:30–2:50 · Aashita · Tonight's plan
**Do:** open **6 PM Brief**, then zoom the map out to all sites.

> "At 6 PM, here's tomorrow's plan: 300 real sites ranked, every number traced to USDA, Open-Meteo or the Weather Service with a timestamp, and the data gaps called out instead of hidden. Gemini writes the summary, but the facts come from the rules, and it falls back to a template if the AI is down."

### 2:50–3:00 · Rishi · Close
> "That's Groundwork: which sites crews can reach tomorrow, with what, and when it's not safe. Happy to go deeper on anything."

**Stop at 3:00.** Let the judges ask.

---

## If something breaks (say it and keep going)

| Problem | Who | Do and say |
|---|---|---|
| Beacon or USB fails | Anson | Unplugged, it shows `NO LINK` within 6 s. Run `python scripts/replay_sensor_v2.py --loop --interval 2 --token dev-sensor-token`: "The USB link dropped, so this is a simulated sequence standing in for the beacon, labeled Recorded demo." |
| Probe skips MATS and goes straight to NO GO | Anson | "Even wetter: now it's NO GO for the heavy truck." Then move back to the damp patch. |
| Site page shows "stale" weather | Rithika | "Our data refreshes every 3 hours and marks itself stale after 6, so the site reads UNKNOWN rather than old data." Refresh between groups. |
| Learned forecast box missing | Rithika | It hides when weather is stale or an input is missing. Show `backend/ml/EVALUATION.md` on the laptop instead. |
| Gemini slow or offline | Aashita | Show the saved briefing; the template summary works with no AI. |
| Wi-Fi down | Anyone | The API reads a saved snapshot and the Florida map works offline: "It's built to keep working when a data source is down." |

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
| "Isn't your ML just rules?" | Rithika | "The safety engine is rules on purpose. Next to it is a trained model, tested on a held-out year: 0.85 vs 0.78. It ties in Florida, so it stays advisory." |
| "Why logistic regression?" | Rithika | "Gradient boosting was within 0.01 on AUC but worse on precision and calibration. Logistic regression explains each prediction as named factors, gives honest probabilities, and runs inside the API with no extra libraries." |
| "How did you split the data?" | Rithika | "By time, never shuffled: trained July 2023 to June 2025, tuned on the last six months of that, tested on July 2025 to June 2026." |
| "Does it guarantee trucks won't get stuck?" | Rishi | "No. It's advance planning from soil surveys and forecasts; a supervisor still decides." |
| "Can mats override lightning?" | Rishi | "Never. STOP WORK beats every access call." |
| "Why Arduino, not a Pi?" | Anson | "The Uno has analog inputs for moisture and light, and USB keeps the demo independent of venue Wi-Fi." |
| "What if the beacon disconnects?" | Anson | "`NO LINK` within 6 seconds. It never shows green on stale data." |
| "How do you know the data is real?" | Aashita | "Every number shows its source and fetch time, and we count coverage: soil for 255 of 300 sites, the rest show UNKNOWN." |
| "How would you deploy and secure it?" | Aashita | "FastAPI on Render today; Auth0 roles checked on the backend; sensor writes need a token; no secrets in the repo; a saved snapshot keeps the plan alive when an API is down." |
| "Perry Weather already does lightning." | Rishi | "Agreed, and we'd plug it in. Our contribution is the per-vehicle access and mats call for tomorrow." |
| "Who pays?" | Rishi | "Utility operations teams (fewer stuck trucks, fewer wasted mat hauls) and mat vendors (demand for overnight staging)." |

---

## Tailor the first line by judge

| Judge | Open with |
|---|---|
| **Sperry** | Their scenario: "A remote site, heat climbing, storms building, ground soaked after a week of rain." Make sure they see the mats call and the held-out scores, including where it only ties. |
| **NextEra / FPL** | "Your crews, tomorrow morning." Rithika can mention her FPL internship. |
| **Hardware** | Start with the beacon; offer to unplug the USB live. |
| **AI track** | Lead with what AI does and doesn't do, then the held-out evaluation. Offer `backend/ml/EVALUATION.md`. |
| **Security** | Auth0 roles, token-protected sensor writes, no secrets in the repo. |

**30-second version** (busy judge): Rishi's opening line → Anson's probe turns the beacon amber → Aashita's storm replay alarms the beacon → Rishi: "300 real sites, real weather and soil, and a plan every evening at 6. Want the full three minutes?"
