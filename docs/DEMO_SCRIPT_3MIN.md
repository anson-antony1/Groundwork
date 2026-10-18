# GroundWork — Judge-Friendly Speaker Notes

**SwampHacks XII · Sunday, October 18 · 10 AM–12 PM · REI Grand Ballroom**  
**Demo target:** ~3 minutes per judge group. **Style:** speak naturally, show the product early, let the judge interact.  
**One-sentence pitch:** *GroundWork helps utility dispatchers decide which sites need attention **before** sending crews—using weather, soil information, vehicle-specific access recommendations, and an easy-to-understand plan for tomorrow.*

> **How to use this document:** The **Say** text is the short script to rehearse. The **Do** instructions are stage directions, not words to speak. The technical explanations and backup plans later in the document are for judge questions. Speak slowly enough to be understood; cut words rather than rush. The time blocks are targets, not guarantees.

## 1. Who presents what

| Speaker | Main responsibility | What to demonstrate | Approximate time |
|---|---|---|---|
| **Rishi** | Frontend / user experience | Opening, map, vehicle switch, crew report, close | 45–55 sec |
| **Anson** | Arduino / sensors | Soil probe, beacon lights and alarm, acknowledgement | 35–45 sec |
| **Aashita** | Backend / safety logic | Mats and cost estimate, Hurricane Milton replay, STOP WORK rule | 35–45 sec |
| **Rithika** | Machine learning / AI / automation | Logistic regression forecast, 6 PM briefing, Gemini, n8n, Claude/MCP | 45–55 sec |

## 2. Main 3-minute speaking script — plain English

### 0:00–0:20 — Rishi: Why GroundWork exists

**Do:** Open the map and point at the colored pins and the prioritized list.

**Say:**
> “Imagine you're a utility supervisor planning tomorrow's jobs. You've got hundreds of locations, and it's been raining all week. Sending a heavy truck onto soft ground could get it stuck—or you could waste money ordering protective mats you didn't need. GroundWork brings the weather, soil data, and site recommendations into one map so you know which locations to review first.”

**What judges should see:** A real map with easily understood statuses. **Do not describe mapped substations as verified work orders.**

### 0:20–0:45 — Anson: The hardware actually reacts

**Do:** Move the soil probe from a dry patch to damp soil; point to the beacon. Use the actual observed status if it differs from the rehearsal.

**Say:**
> “Here's our physical demo. The Arduino measures soil moisture and sends the reading to our Python server. When I move the probe into wetter soil, the system updates its recommendation, and the beacon changes color to warn the crew. The Arduino isn't making the safety decision; it's displaying what the software decided.”

**If the beacon turns amber:** “Amber means mats should be considered and a supervisor should review the access plan.”

### 0:45–1:00 — Rishi: Same site, different vehicle

**Do:** Invite a judge to change **Pickup** to **Heavy truck**.

**Say:**
> “Try switching the vehicle. It's the exact same ground, but a heavier truck has different access needs. A pickup might be okay for review, while the heavy truck might need mats—or might be a no-go.”

### 1:00–1:15 — Aashita: Mats and cost

**Do:** Open the mats-and-cost panel. Read the **actual** numbers displayed; don't memorize a number that may change with the inputs.

**Say:**
> “If mats might help, GroundWork estimates how many you'd need based on the access route and compares that with the estimated cost of postponing the job. The numbers are editable planning estimates, not real vendor quotes.”

**Optional concrete example if displayed:** “For a 100-foot route, our sample settings estimate roughly 42 to 48 mats.”

### 1:15–1:40 — Aashita + Anson: Storm replay and safety override

**Do:** Start **Hurricane Milton** replay. Show STOP WORK; let the judge acknowledge the beacon alarm. Stop the replay **before** the crew lightning report step.

**Aashita says:**
> “Let's replay Hurricane Milton using historical weather and Weather Service warnings. The affected Florida sites switch to STOP WORK. Even if mats could help the ground, they can't make dangerous storm conditions safe. Weather safety always comes first.”

**Anson says:**
> “Tap the beacon. That tells us somebody noticed the alert; it does **not** cancel STOP WORK.”

**Accuracy note:** Read the affected-site count off the actual replay instead of promising that every site turns red.

### 1:40–2:00 — Rishi + Anson: Reported lightning

**Do:** On the phone, submit a **Lightning observed** crew report for the demo site. Show the map pin and, if active, the beacon countdown.

**Rishi says:**
> “A crew member can report seeing lightning right from their phone. The observation appears on the map, and it's marked as unverified until a supervisor reviews it.”

**Anson says:**
> “For our demo, nearby reported lightning triggers a STOP WORK countdown. The crew must wait through the all-clear period, and another report can restart it. This is a crew-report system—not a live lightning-strike detection network.”

### 2:00–2:33 — Rithika: What machine learning adds

**Do:** Open a site page and point to the **ML forecast / advisory** prediction and its reasons.

**Say:**
> “We also trained a **machine learning model called logistic regression**. Basically, it learns patterns from past weather forecasts and National Weather Service alerts to estimate the chance of a STOP WORK-type weather alert tomorrow. We trained it using older data and tested it on a completely separate year it hadn't seen before. It performed better than our basic rule score at ranking alert days. But it's only an extra warning; our transparent safety rules still make the actual STOP WORK call.”

**If the judge asks for proof:** “On the held-out year, the ML model scored **0.852 ROC-AUC**, versus **0.778** for the existing rule score. That's a measure of ranking performance—not 85% accuracy.”

### 2:33–2:57 — Rithika: The 6 PM briefing, Gemini, n8n, and Claude

**Do:** Open **6 PM Brief**, then click **Email this plan** *only if n8n is active and connected*. Be ready to show a previously sent email.

**Say:**
> “At 6 PM, GroundWork turns those site recommendations into a plan for tomorrow. **Gemini** helps write the summary in everyday language, using numbers our Python system already calculated. **n8n** is our automation tool—it sends the plan by email on a schedule. And through **MCP**, which is a connector between apps, we let **Claude Desktop** answer questions using our GroundWork data, like ‘Which sites need attention tomorrow?’”

**If time is tight:** End after “...sends the plan by email on a schedule.” Explain Claude only in Q&A.

### 2:57–3:00 — Rishi: Close

**Say:**
> “That's GroundWork: safer, clearer planning **before** crews head out. What would you like to see?”

---

## 3. Rithika's speaking cheat sheet — what the technology means

These descriptions are meant to be easy to say *without sounding like you're reading a textbook*.

| Technology | What it is, in plain English | What it does in GroundWork | What it **doesn't** do |
|---|---|---|---|
| **Logistic regression** | A machine learning model that learns which combinations of inputs make an event more or less likely | Estimates the **probability of an NWS STOP-WORK-type alert** covering a site tomorrow, based on forecast weather, location, and season | Does not decide whether a truck can drive on the ground; does not override safety rules |
| **Gemini** | Google's generative AI model—a writing assistant | Turns the backend's calculated recommendations into a readable 6 PM briefing | Does not invent or approve the weather/ground safety statuses |
| **n8n** | An automation tool: “when X happens, automatically do Y” | Triggers or sends briefing emails, including the scheduled 6 PM flow | Not itself an AI prediction model; needs an active, working workflow |
| **MCP** (Model Context Protocol) | A standard way to connect an AI assistant to external tools | Lets Claude Desktop access GroundWork API functions | Not a second weather model or a replacement backend |
| **Claude Desktop** | An AI assistant you can talk to | Answers follow-up questions by using the GroundWork tools exposed through MCP | Does not set STOP WORK or make the final field decision |
| **FastAPI** | The Python backend that powers the app | Fetches stored readings, calculates risk/access calls, and serves the data to the website | Does not necessarily fetch fresh weather every time someone opens a page |

### How logistic regression works — one everyday example

Imagine historical days with **heavy forecast rain**, **strong wind gusts**, and **high heat**. The model learns how much each factor changes the likelihood of an NWS alert. For tomorrow's forecast, it combines those factors and gives a percentage. It can also show factors that raised or lowered the estimate.

**Important:** This predicts an **NWS alert**, **not** “there's a 70% chance somebody gets hurt,” and not “there's a 70% chance the ground is unsafe.”

### Why this model instead of a more complicated one?

> “We compared logistic regression with gradient boosting. Logistic regression is easier to explain to a supervisor, runs with lightweight Python code, and produced more useful probability estimates in our evaluation. We didn't choose the most complicated model just for the sake of it.”

### What the evaluation numbers mean

| Measure | Actual result on held-out year | How to explain it |
|---|---:|---|
| **Logistic regression ROC-AUC** | **0.852** | Better at putting real alert days higher on the risk list |
| **Rule-score ROC-AUC** | **0.778** | The simple score is useful, but ranked alert days less well across all test sites |
| **ML PR-AUC** | **0.278** | A metric that's especially helpful because alert days are relatively rare |
| **Florida subset** | **ML 0.796 vs rules 0.805** | The ML model **did not beat the rules in Florida**; don't claim universal superiority |

**Test setup:** 300 mapped sites; training from **July 2023–June 2025**, evaluation on **July 2025–June 2026**. Historical inputs came from archived forecasts; labels came from archived National Weather Service alerts. This measures **alert prediction on that dataset**, not actual safety outcomes or future field reliability. The archive's short-horizon forecast data may make evaluation more favorable than a true next-day live forecast.

**For judges:** Lead with the useful idea, *then* give ROC-AUC if asked. Never call 0.852 “85.2% accuracy.”

---

## 4. Meaning of the safety labels

| On screen | In everyday English | What the crew/supervisor should understand |
|---|---|---|
| **NORMAL** | No weather hazard threshold currently triggered | Still review the work plan |
| **CAUTION** | Conditions deserve extra care | Supervisor checks the conditions and restrictions |
| **STOP WORK** | The weather safety rules say to stop | Mats and a truck change cannot override a weather stop |
| **GO FOR REVIEW** | Ground access looks less concerning for this vehicle | Still not a guarantee of safe passage |
| **MATS FOR REVIEW** | Ground protection may be needed | Check mat plan and ground conditions before proceeding |
| **NO GO FOR REVIEW** | The ground-access recommendation is too restrictive for this vehicle | Reconsider the route, vehicle, timing, or site conditions |
| **UNKNOWN** | Important information is missing or stale | Don't turn missing data into a green light |

**Memory trick:** **STOP WORK = weather safety. NO GO / MATS = getting vehicles onto the site. REVIEW = human signs off.**

---

## 5. Pre-demo checklist — do this before judges arrive

- [ ] Weather snapshot is recent; check no unexpected **stale** banners. If needed: `python -m backend.scripts.refresh_weather_loop_v2 --once` **well before** the expo; the previous team notes allow about 4–5 minutes.
- [ ] Main demo/reset flow has been tested; reset replay, crew reports, alarm acknowledgements, and beacon state as intended.
- [ ] Map is loaded and vehicle is set to **Pickup** so the judge can switch it.
- [ ] Arduino is connected. Test the dry-to-damp probe transition. Do **not** promise amber if the actual reading will result in NO GO.
- [ ] Crew-report form is ready on the phone, with **Lightning observed** selected for the demo site.
- [ ] A Florida site with a visible ML forecast is open in a separate tab.
- [ ] Hurricane Milton replay starts, displays the intended statuses, and stops cleanly.
- [ ] n8n is running, its workflow is **Active**, the email is deliverable, and a real previously delivered message is open as fallback.
- [ ] Claude Desktop + the MCP server work **if you intend to demo them live**. Otherwise talk about them and demonstrate only if asked.
- [ ] Disable notifications, verify screens/zoom, and keep the team on the same 3-minute route.

**Important deployment clarification:** Having a 3-hour weather refresh script does not prove it is running on Render. Check actual hosting logs/scheduling before claiming automatic updates on the live server. Likewise, schedule-based emails require an active n8n workflow and a running host.

---

## 6. If something fails — keep talking, don't panic

| If this happens | Owner | Do this / say this |
|---|---|---|
| Beacon/USB disconnects | Anson | Show `NO LINK` if present. “The hardware disconnected, so we'll show the same interface with recorded demo readings.” Only launch a sensor replay if it's set up and clearly labeled simulated. |
| Probe shows NO GO rather than MATS | Anson | “That ground is even wetter than our mats threshold, so this vehicle gets NO GO.” Don't force the claim that it turned amber. |
| Page or backend API is slow | Aashita | Open local `/docs` or a previously loaded page. “Our interface is backed by documented Python API endpoints.” |
| Weather is marked stale | Aashita | “We don't pretend six-hour-old data is live. Missing or stale inputs are shown as UNKNOWN.” Refresh between groups if possible. |
| ML forecast card is missing | Rithika | “The forecast hides when required inputs are unavailable.” Show `backend/ml/EVALUATION.md` or the model endpoint as evidence instead. |
| Gemini is unavailable | Rithika | “The planning math still works. We have a normal text template as a backup.” |
| n8n/email isn't working | Rithika | Do **not** click repeatedly. Show a previously delivered email and explain the workflow. Don't claim it just sent a message. |
| Claude/MCP can't connect | Rithika | “Claude is an optional way to ask questions. The website and safety decisions don't depend on it.” |
| Venue Wi-Fi is unreliable | Anyone | Use the **cached snapshot / mock demo** only if available. Clearly distinguish live data from recorded or replayed examples. |

---

## 7. Judge questions — easy answers by person

### Rishi — frontend and product

**Q: Why does the map use different colors?**  
A: “So a busy supervisor can instantly see which sites are urgent and which need more review. The details explain *why*.”

**Q: Can crews use this on phones?**  
A: “The report form is phone-friendly, so workers can submit observations from the field when they can reach our server.”

**Q: Aren't these just points from OpenStreetMap?**  
A: “Yes. They're publicly mapped substation locations for the prototype, **not confirmed utility work orders**. Real deployment would connect to a utility's actual job sites and access routes.”

**Q: What's your business case?**  
A: “Utilities could use this to better plan site visits, mat deliveries, and rescheduling. Actual savings would need field validation.”

### Anson — beacon and sensors

**Q: What exactly is the beacon?**  
A: “It's an Arduino device with lights and alerts. It makes the website's safety recommendation visible at the physical demo site.”

**Q: Why Arduino instead of Raspberry Pi?**  
A: “Arduino is simple for reading the analog sensors and communicating by USB. The Python backend does the heavier calculations.”

**Q: What happens if it disconnects?**  
A: “The beacon can display `NO LINK` rather than pretending the old reading is still current.”

**Q: Does tapping the beacon clear STOP WORK?**  
A: “No. It only records that someone acknowledged the warning.”

### Aashita — backend and decisions

**Q: What's the difference between STOP WORK and NO GO?**  
A: “STOP WORK is a weather safety override. NO GO is a recommendation about whether a particular vehicle can access that ground. They answer different questions.”

**Q: Why would a heavy truck require mats but a pickup not?**  
A: “The heavier vehicle needs more support. We use different policy thresholds for different vehicle classes.”

**Q: How do you calculate mats?**  
A: “We use the estimated route area divided by the area covered by one mat, then add a configurable allowance. The estimate is a planning aid.”

**Q: Are the risk thresholds scientifically validated?**  
A: “No, they're transparent **demo policy thresholds**. Utilities would need to tune and validate them for their vehicles and sites.”

**Q: How do you handle missing weather or soil data?**  
A: “We mark it UNKNOWN rather than quietly treating missing information as safe.”

**Q: How is the app hosted?**  
A: “The Python backend and web frontend can be deployed on Render; we also have a static mock demo. Security and background refresh depend on the configured deployment.”

### Rithika — ML, Gemini, n8n, MCP

**Q: Which machine learning model did you use?**  
A: “**Logistic regression**. It's a model that takes things like rain, wind, temperature, season, and location, and estimates the chance of a Weather Service alert tomorrow.”

**Q: So is 0.85 your accuracy?**  
A: “No. It's **ROC-AUC**, which measures how well the model ranks actual alert days above non-alert days. It's not the percentage of forecasts it got correct.”

**Q: Isn't your ML just copying your rules?**  
A: “No. We trained it using **real historical Weather Service alerts**, not our rule outputs. The rules decide statuses; ML separately estimates tomorrow's alert probability.”

**Q: How do you know it generalizes?**  
A: “We trained on earlier years and tested on a later, untouched year. That gives a fairer check than testing it on the same records it studied.”

**Q: Did your model beat the rules everywhere?**  
A: “No. Across the full test set, it ranked alert days better. In the **Florida-only subset**, the existing rule score actually did slightly better. That's why we don't let ML override safety decisions.”

**Q: Does it predict whether a truck will get stuck?**  
A: “No. We don't have real historical labels for stuck trucks. It predicts **Weather Service alert risk**, while access guidance comes from transparent rules and soil data.”

**Q: Why logistic regression rather than a deep neural network?**  
A: “It's fast and explainable, and it gives a probability rather than just a label. We tested gradient boosting too, but chose logistic regression for a simpler, more understandable deployed model.”

**Q: What's Gemini doing?**  
A: “Gemini **writes the explanation** of recommendations calculated by our backend. It doesn't decide whether it's safe to work.”

**Q: What's n8n? Is it AI?**  
A: “**n8n is a workflow automation tool**—like a digital assistant for repetitive steps. At 6 PM it can trigger the briefing and email it. It isn't the risk prediction model.”

**Q: What's MCP?**  
A: “It stands for **Model Context Protocol**. Think of it as a bridge that lets Claude Desktop use our GroundWork API as tools, so people can ask questions in plain English.”

**Q: Why both Gemini and Claude?**  
A: “They do different jobs. **Gemini drafts the scheduled summary**; **Claude answers interactive follow-up questions** when connected through MCP. Our Python backend still owns all the actual calculations.”

**Q: What if the AI services are down?**  
A: “The rules and website still work. We have a backup briefing template, and Claude is optional.”

**Q: Is the forecast model automatically retrained every day?**  
A: “No. The deployed logistic regression uses trained weights from a saved file. That's separate from fetching fresh forecasts to run predictions.”

---

## 8. Claims to keep accurate

- Say **“300 publicly mapped substation sites”**, not 300 confirmed job sites.
- Say **“weather and access recommendations for supervisor review”**, not guaranteed safety clearance.
- Say **“the ML model predicts NWS alert likelihood”**, not the probability a worker is injured or a truck gets stuck.
- Say **“historic replay of archived storm conditions”**, not current Hurricane Milton warnings.
- Say **“crew-reported lightning”**, not a live lightning-strike sensor network.
- Say **“editable estimated costs”**, not guaranteed money saved.
- Say **“scheduled email when n8n is running and configured”**, not automatic delivery that you haven't demonstrated.
- Don't say archived data is perfectly equivalent to a live 6 PM next-day forecast. It is not.
- Don't claim photo-based AI tagging; the upload/report feature is separate.
- The **human supervisor makes the final field decision**.

## 9. Quick deep-dive routes (if the judge wants more)

| Judge interest | Lead | Best thing to show |
|---|---|---|
| Sperry Tech / utility planning | Aashita + Rithika | STOP WORK override, ground access by vehicle, mats, historical ML evaluation |
| AI / ML | Rithika | `backend/ml/EVALUATION.md`, logistic regression reasons, Gemini fallback, Claude MCP question |
| Hardware | Anson | Live soil sensor, beacon acknowledgement, disconnect `NO LINK` |
| UI/UX / “Easy On The Eyes” | Rishi | Map, legend, vehicle toggle, site-detail explanations, mobile report |
| Backend / security | Aashita | API documentation, source timestamps, authentication/configuration, tests |
| Utility industry | Rishi + team | Tomorrow's crew-planning workflow and how it could connect to real work orders |

## 10. 30-second backup pitch

**Rishi:** “GroundWork helps utility crews plan tomorrow's sites before anyone drives out, combining weather and soil data on one map.”  
**Anson:** “This Arduino probe shows how live ground conditions can change the site's recommendation.”  
**Aashita:** “We estimate mats and costs, and severe storm conditions override every access plan.”  
**Rithika:** “Our logistic regression model adds tomorrow's alert probability, and Gemini plus n8n turns the results into an emailed 6 PM plan.”  
**Rishi:** “Want to see it in action?”

---

### The one line to remember

**GroundWork doesn't replace a safety supervisor. It gives them clearer information and a plan before the crew arrives.**
