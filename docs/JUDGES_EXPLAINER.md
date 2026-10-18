# GroundWork — Complete Plain-English Guide & Judge Prep (Revised)
**Code reviewed:** `anson-antony1/Groundwork`, `main` branch, October 17, 2026.  
**Read this first:** This is a **proactive planning prototype**, not a certified safety or civil-engineering tool. “Real data” means sourced forecasts/surveys/alerts; it does **not** mean ground strength was measured at every site. Features mentioned as optional/future are not represented as built.

## 0. The 30-second explanation
GroundWork helps utility dispatchers plan **tomorrow's** crew visits *before vehicles are sent*. It uses weather forecasts, recent rain and government soil maps to flag weather hazards and possible soft-ground access issues for pickup trucks versus heavy utility trucks. It explains decisions on a website, produces a 6 PM briefing (Gemini can rewrite it), and can email the briefing through n8n. A tabletop Arduino beacon is an optional physical demonstration. **A supervisor, not the app, makes the final decision.**

**The problem:** A weather forecast alone does not answer “Can our specific vehicle reach this work area tomorrow?” Weather, soil conditions, vehicle type, and access-route planning are currently separate pieces of information. GroundWork combines them into one explainable planning workflow.

## 1. What is a substation? Why are you showing them?
An electrical **substation** is a facility that changes voltage and routes electricity through the power grid. It often has transformers, switches and fenced equipment. Many substations have paved or compacted internal roads; therefore **a substation pin is NOT evidence that its actual access route has soft soil**. A public map point is only a convenient geographic anchor for a hackathon demonstration.

**Tell judges:** “Our mapped points are public OpenStreetMap substations, not verified customer assignments or known muddy entrances. The real product would let a utility upload its actual job sites and GPS coordinates, including access-road geometry.”

**Better framing:** Focus on *access roads, easements, roadside poles, repair sites, and off-road utility jobs*, where wet ground is much more plausible than the interior of a paved substation.

## 2. Can users type Miami or choose their location?
**Current UI:** The operations map has a search box that filters **already loaded sites by name, region or site ID** (`frontend/src/screens/ops-map/OpsMapScreen.tsx`). Typing “Miami” will only match if a loaded site has Miami in those fields. **It does not currently call an address geocoder, create a Miami job site, or automatically query USDA/Open-Meteo for arbitrary typed coordinates.** A separate script can prepare geographically different collections, but that is not the same as a working public UI feature.

**What would be great to add:** “Add a site” form: type `Miami, FL` → geocode to latitude/longitude → choose an exact point or draw an access route → fetch conditions → calculate status → label as user-supplied. This is a **high-value extension**, but must be implemented and tested before you claim it exists.

### How did OpenStreetMap select substations?
`get_sites.py` calls the **Overpass API**, querying OpenStreetMap tags:
```text
nwr["power"="substation"](28.3,-82.6,30.6,-80.9);out center 60;
```
In layman's terms:
- `nwr` = look at nodes, ways and relations (types of OSM objects).
- `["power"="substation"]` = include mapped objects tagged as electrical substations.
- Numbers in parentheses = geographic bounding box: south, west, north, east.
- `out center 60` = return coordinates or center points for up to 60 matching objects.

OSM is community-maintained; tags can be incomplete or mistaken. “First 60 returned” is not random sampling and is **not** a verified collection of utility job sites. Current backend site lists come from `fixtures/sites_50.json` plus a demo tray, not from a fresh OSM search on every page load.

## 3. The full architecture in one picture
```text
Publicly mapped site locations OR future supervisor-entered work sites
                          |
      Open-Meteo forecast and recent rain
      USDA NRCS soil survey (drainage, clay)
      NWS alerts (official warnings)
                          |
  fetch/refresh script -> weather_snapshot.json
                          |
         FastAPI Python backend (the brain)
         ├── Weather hazard decision A
         ├── Ground access decision B by vehicle
         ├── Mat quantity and money comparisons
         ├── Briefings (template + optional Gemini wording)
         ├── Reports, replay, beacon/status events
         └── SQLite storage
                          |
           /api/v1/... JSON endpoints
                          |
              React/Vite website
       Map | Site detail | Demo Tray | Replay | 6 PM Brief
                          |
       “Email this plan” -> n8n webhook -> SMTP email
                          |
        MCP connector -> Claude Desktop (separate client)
                          |
     USB Arduino bridge -> tabletop beacon (if connected)
```

**Frontend** = what the dispatcher sees/clicks in a browser.  
**Backend** = Python server that enforces rules, returns data, saves events.  
**API endpoint** = a URL the frontend can ask, e.g. `GET /api/v1/sites`.  
**JSON** = structured data returned from an API.  
**SQLite** = an on-disk database for briefings, reports, readings and events.  
**Vite** = frontend development/build tooling; **React/TypeScript** = website code; **FastAPI** = Python API framework.

### Example: clicking a site
1. React requests `GET /api/v1/sites/SITE-001`.
2. FastAPI calls backend services to assemble weather and access status.
3. It reads the latest saved environmental observations, checks whether they are missing/stale, evaluates the rules, and returns JSON.
4. React displays risk, explanations, sources, truck-specific calls and actions.
5. If a supervisor changes vehicle or mat dimensions, UI sends inputs to `POST /api/v1/sites/SITE-001/evaluate` for a **new evaluation**. The frontend does not independently invent the result.

## 4. Where the data comes from (and which is actually current)
| Data | Source | Is it today's measurement on site? |
|---|---|---|
| Forecast rain, wind gusts, apparent temperature | Open-Meteo | Forecast/model, **not** a gauge at the job site |
| Previous 7 days' rainfall | Open-Meteo | Modeled historical/recent rainfall |
| Soil drainage class and clay percentage | USDA NRCS Soil Data Access | Soil survey estimates, **not** real-time |
| Active severe-weather alerts | NWS API | Current alert data when fetched |
| Substation names/points | OpenStreetMap via Overpass | Public map features, not verified work orders |
| Moisture on tabletop demo soil | Arduino demo sensor | Real local demo reading **only when hardware is connected** |
| Storm replay | Archived/reconstructed fixture data | Historical/simulated demonstration, not current conditions |

### USDA example request and output
The backend uses USDA **Soil Data Access**, sends coordinates through a SQL query, and asks for `drainagecl` and `claytotal_r` for a major mapped soil component and surface horizon:
```sql
SELECT TOP 1 c.drainagecl, ch.claytotal_r
FROM component c JOIN chorizon ch ON c.cokey = ch.cokey
WHERE c.mukey IN (
 SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84(
 'point(-81.38 28.54)')
)
AND c.majcompflag = 'Yes' AND ch.hzdept_r = 0
ORDER BY c.comppct_r DESC
```
**Illustrative, not live-verified output:** `{"Table":[["poorly drained","42"]]}`. The first is drainage class, the second a clay percent. Point format is **longitude first**.

**Why those?** Drainage estimates whether water tends to linger; clay influences soil behavior when wet. They are coarse *proxies*, not direct strength or rutting measurements. More clay is **not always worse**; less clay is **not always more dangerous**. Sand may drain quickly yet still lack bearing strength, and clay behavior depends on moisture and soil structure.

**How old is USDA?** The database is periodically refreshed, but the mapped observations can be years or decades old. The timestamp at which GroundWork fetches it is NOT the date the earth was tested. Survey coverage is broad across the US but not complete and not appropriate alone for exact-wheelpath engineering decisions. Official background: https://www.nrcs.usda.gov/resources/data-and-reports/soil-survey-geographic-database-ssurgo

## 5. What are snapshot files? Are they fake?
A **snapshot** is a saved copy of data fetched at a particular time — like taking a screenshot, but of the API results rather than the screen.

In this repo:
- `fixtures/weather_snapshot.json`: cached Open-Meteo, USDA and NWS data with fetch times and values.
- `fixtures/sites_50.json`: the preselected set of geographic locations used by the backend.
- `fixtures/storm_replay.json`, other replay files: **historical/scenario demonstration** records.
- `frontend/src/mocks/...`: intentionally simulated browser-only backend used for development.

**Why cache?** If the website calls 60–300 public APIs for every map refresh, it may be slow, fail due to rate limits, or depend on venue Wi-Fi. Instead the refresh script fetches data ahead of time and the API reads it quickly. Current backend policy marks weather snapshots as stale after **6 hours** (`backend/app/services/weather.py`).

**IMPORTANT:** cached does NOT equal fake; it can be authentic but aging data. Offline demo fixtures or replay are *simulated/historical* and must carry clear labels. When information is too old, missing, or an API fails, show **STALE/UNKNOWN**, not green GO. A fallback is for showing the product mechanics, **not** claiming a current safe decision.

## 6. Why Celsius if we're in the US? Why 7 days of rain?
The backend uses normalized units: `mm` of rainfall, `km/h` gusts and **Celsius** apparent temperature because the policy constants are written in those units (`backend/app/services/hazard.py`). The **website could display Fahrenheit** using `F = 9C/5 + 32` while sending/storing the expected unit consistently. Never feed 95 °F directly into a rule expecting 35 °C; that would corrupt the score.

**Why past seven days?** Because soil can stay wet after a storm. If it rained heavily Sunday and a crew visits Wednesday, today's forecast alone hides that wetness. Seven days is a **simple engineering-inspired heuristic/window**, not a universally scientifically optimal period; rainfall accumulation, drainage, evaporation and soil type matter. An improved version could compare 1-, 3-, 7-day rain and actual field moisture, but requires validation.

## 7. The current backend has TWO decisions, not one
Do not repeat the outdated older `rain + moisture + soil + flood` formula as the current design.

### Decision A — WEATHER SAFETY (same for pickup and heavy truck)
Uses forecast rainfall, wind gusts and apparent temperature:
```text
rain_points = 4 × clamp(rain_mm / 50, 0, 1)
wind_points = 3 × clamp((gust_kmh - 30) / (80 - 30), 0, 1)
heat_points = 3 × clamp((apparent_C - 32) / (41 - 32), 0, 1)
hazard_score = round(min(10, rain_points + wind_points + heat_points), 1)
```
`clamp(x,0,1)` means keep the value between 0 and 1. `min(10, ...)` is a cap: on the 0–10 scale, don't ever output 11 or 14. In this **current** implementation each component already maxes at 4, 3 and 3 (summing to 10), so the cap is mainly extra protection.

**Example: what does “up to 4 points by 50 mm” mean?**
| Tomorrow's forecast rain | Rain points (of 4 max) |
|---:|---:|
| 0 mm | 0 |
| 10 mm | 0.8 |
| 25 mm | 2.0 |
| 50 mm | 4.0 |
| 70 mm | Still 4.0 |

There is no claim 50 mm is an official safety cutoff. It is a **demo policy setting**.

**Weather state:** score <3.5 = NORMAL; 3.5–<6.5 = CAUTION; >=6.5 = STOP_WORK. Applicable severe NWS events (e.g. tornado, hurricane, thunderstorm or flash flood warnings) can **force STOP_WORK regardless of the arithmetic**; other actionable NWS alerts can force CAUTION. Missing key data or failed NWS check = UNKNOWN. This is a **prototype policy**, not a regulation or a certified hazard model.

### Decision B — GROUND ACCESS (different for each vehicle)
This asks not “Is there a storm?” but “Would this ground *possibly* be difficult for this vehicle to access?”
```text
past_rain_points = 4 × clamp(rain_7d_mm / 50, 0, 1)
tomorrow_rain_points = 2 × clamp(tomorrow_rain_mm / 25, 0, 1)
drainage_points = drainage_rank × 0.75    # rank 0–4
clay_points = 1 if clay_pct >= 40 else 0
ground_index = round(min(10, sum_of_above), 1)
```
If required rainfall or drainage inputs are missing, this ground index becomes **UNKNOWN**. Clay % is optional in code and missing clay doesn't earn a clay point (the missingness still deserves a provenance note).

**Numerical example (illustrative):**
- Past 7 days rain = 25 mm → `4×25/50 = 2`
- Tomorrow rain = 12.5 mm → `2×12.5/25 = 1`
- Poorly drained (rank 3) → `3×0.75 = 2.25`
- Clay = 42% → `+1`
- Total ground wetness index = **6.25 → 6.2 or 6.3 depending on Python rounding / floating value representation**; treat displayed computed result as authoritative.

For pickup: index <5 = GO_FOR_REVIEW; 5–<7.5 = MATS_FOR_REVIEW; >=7.5 = NO_GO_FOR_REVIEW.  
For heavy truck: index <3.5 = GO_FOR_REVIEW; 3.5–<6 = MATS_FOR_REVIEW; >=6 = NO_GO_FOR_REVIEW.

For index ~6.25: **pickup = MATS_FOR_REVIEW; heavy truck = NO_GO_FOR_REVIEW**. The rain didn't change, only the vehicle. Heavy trucks usually impose larger total axle loads and can require different traction/support; exact bearing pressure depends on tire count, pressure, tracks, loading, etc., so “all heavy vehicles always sink more” is oversimplified.

**Final effective display:** STOP_WORK overrides vehicle choices. UNKNOWN never becomes a green approval. The rule is **not** a geotechnical bearing-capacity test, and “GO_FOR_REVIEW” means *eligible for supervisor review*, not guaranteed safe access.

### “Deterministic rule engine” in plain English
It means **a regular Python calculator with explicit rules**: same inputs + same rules = same output. It isn't the LLM improvising safety decisions. `backend/app/services/hazard.py` holds those formulas. You can tell a judge exactly which inputs made the number change.

### “Risk intelligence” in plain English
It is the part that **turns raw weather/soil numbers into an ordered to-do list**: which sites need attention first, why, what data are missing, which vehicle is impacted and what supplies may help. “Intelligence” here means useful analysis, not necessarily machine learning. (There is now also a small, tested ML forecast; see section 7b. It's advisory and never decides.)

## 7b. New for Sperry's PlanIT brief: lightning, wildfire, wildlife, ML forecast
Sperry's brief for this event ("PlanIT Control") asked for four things the first version didn't have. All four are live.

**Lightning: stop within 10 miles, 30-minute all clear.** When a crew member reports lightning (report category "lightning observed"), every site within 10 miles goes to STOP WORK until 30 minutes after the newest report, and each new report restarts the clock. The beacon shows it: `STOP - CLR 29:41` counting down, then `ACKD - CLR …` after someone taps it. Tapping silences the buzzer but never ends the stop; a new strike sounds it again. Honest line: *"We don't have a licensed lightning network, so strikes come from crew reports, and every alert says so. A utility would plug its strike feed into the same rule."* A supervisor rejecting the report cancels it. It's switched off during storm replays, which show only historical data.

**Wildfire.** Every 3 hours we pull the official list of active wildfires (NIFC, not yet 100% contained). A fire within 10 miles raises a NORMAL site to CAUTION (demo policy); each site also shows how many fires are within 25 miles. At the Oct 17 fetch: 199 active fires nationwide, 8 of our sites with one within 25 miles.

**Wildlife.** For each site we count American alligator sightings within 10 km in the last 30 days from iNaturalist, a community wildlife app. It's a "brief the crew" note only, labelled unverified, and never changes a status. At the Oct 17 fetch: 72 sites had sightings (81 near the UF venue itself).

**ML forecast (brief item 6).** The site page's *Learned forecast* panel gives the chance that a real NWS alert of a STOP-WORK type (the same list our rules use) covers the site during working hours tomorrow, next to the usual rate for that site, with the factors that raised it (*"forecast gusts raises the risk"*). It is a logistic regression (`backend/ml/`, README §8) trained on Open-Meteo's archived forecasts and real NWS alerts at all 300 sites, Jul 2023 to Jun 2025, and tested on Jul 2025 to Jun 2026, a year it never saw:

| Held-out year (AUC: 1.0 = perfect ranking, 0.5 = coin flip) | Learned forecast | Our rules |
|---|---|---|
| All 300 sites | **0.85** | 0.78 |
| Other states (240 sites) | **0.87** | 0.77 |
| Florida (60 sites) | 0.80 | 0.81 |

- **Its warnings are more often right:** of the 10% of site-days it rates riskiest, those days hold 52% of all STOP-WORK days (our rules: 40%). Flagging as many days as our CAUTION call, it is right 37% of the time vs 30%.
- **Say this plainly to judges:** *"Nationwide it beats our rules; on our Florida sites it only ties them, because summer storms come nearly every afternoon. That's why it's advisory and the rules decide STOP WORK."*
- **Limits:** the label is "an alert was issued", not "work was unsafe"; archived forecasts are short-range, so live accuracy will be a little lower; the Hurricane Milton replay day is inside the training years, so the replay shows an in-sample prediction. Full report: `backend/ml/EVALUATION.md`.

**A second model, as the fallback.** Anson's NOAA model (`policies/ml_hazard_model_v1.json`) predicts a different target: a NOAA Storm Events storm or flood report within 25 km. Scored on the same held-out year it reaches 0.82 on the STOP-WORK label (learned forecast 0.85) and 0.89 on its own target (learned forecast 0.90), so the learned forecast is the one shown. The NOAA model's one-line forecast appears only where the learned forecast has no prediction.

## 8. What are ground mats, and why show money?
**Ground protection mats** are portable panels laid along a soft access path so vehicles can distribute load and protect the ground. Mats can be useful in some situations, but they **cannot make an unsafe storm safe**, and a mat recommendation is not an engineering load rating.

The site detail lets a supervisor enter *route length/width, mat dimensions, number of layers, waste margin and inventory*. The backend uses:
```text
base = ceil((route_length × route_width) / (mat_length × mat_width))
low  = ceil(base × layers × (1 + min_margin))
high = ceil(base × layers × (1 + max_margin))
shortfall = max(0, planned_quantity − mats_in_inventory)
```
**Worked example (the app's starting values, `policies/mats_defaults.json`):** 100-ft route × 12-ft width = 1,200 sq ft. A standard access mat effectively covers 14 ft × 8 ft = 112 sq ft. Base = ceil(1200/112) = 11 mats. One layer and 10–25% margin for overlap and waste → **13–14 mats**. With 10 in stock and planning 14, shortfall = **4**. The calculator doesn't verify whether those mats can support the truck.

**Money example (the app's placeholder costs, the same for every site until a supervisor types in real quotes):**
- Stage mats = rental $600 + delivery $150 + installation $100 + removal $50 = **$900**.
- Postpone the job = paid idle labor $1,800 + idle equipment $600 + rescheduling $400 = **$2,800**.
- Modeled difference = postpone $2,800 − mats $900 = **$1,900 favoring mats** under those assumptions. It is *not verified savings*, does not include hidden costs unless entered, and is irrelevant if weather says STOP_WORK.

**Does it help?** Yes, the logistics-and-cost comparison turns a generic red map into an actionable planning tool. But present it as **conditional**: determine safety and technical suitability first; compare money second.

## 9. What exactly does the 6 PM briefing contain?
The current backend `POST /api/v1/briefings/generate` evaluates **all loaded sites**, not just whatever happened to be selected on the map. It saves a briefing in SQLite and returns JSON; the frontend's 6 PM Brief screen displays it. It includes:
- Number of sites evaluated, number STOP_WORK, number missing weather data.
- A **top-10 priority site list** (not every site itemized in prose).
- Site names/IDs, hazard scores, weather states and effective statuses for those top sites.
- An abbreviated narrative, notes on missing data, crew reports needing review, and mat staging ranges.
- Provenance/source labels and whether the narrative came from Gemini or the deterministic fallback.

**Illustrative briefing, not today's live result:**
> “Tomorrow: 60 sites screened. Four STOP WORK due to severe-weather alerts. Seven need supervisor review because key data are unavailable. High-priority: SITE-003 (hazard 8.0/10; STOP WORK); SITE-011 (5.1/10; CAUTION). Two locations warrant checking temporary ground mats for heavy-truck routes; estimated quantities depend on user-entered dimensions. Confirm conditions and access locally before dispatch.”

These are **made-up demo numbers**, not computed current conditions.

**What does Gemini do?** `backend/app/services/narration.py` optionally rewrites structured computed facts in simpler English. It **does not set risk scores or statuses**. If the call fails or it introduces ungrounded numbers, the backend uses an ordinary template. A rendered site briefing is **HTML text on the website**; a browser **Print** flow can make a PDF, but the API does not inherently return a PDF document.

**Who chooses locations?** The backend processes its loaded site collection; site selection on the map does not currently become a custom briefing scope. A “brief only selected sites / selected city” control would be a good improvement.

## 10. What is n8n? SMTP? A production webhook?
- **n8n** = workflow automation software: connect triggers and actions without wiring every step manually.
- **Webhook** = a URL n8n watches. Calling that URL starts an action.
- **Production webhook** = the live URL (`/webhook/groundwork-email`) available when workflow is activated; distinct from editor-only `/webhook-test/...`.
- **SMTP** = the standard protocol used to hand an email to a mail server. Here n8n's email node can send via Gmail SMTP with an app password (not your normal account password).
- **Cron** = a schedule expression. `0 18 * * *` means 6 PM every day **in the workflow's configured timezone**.

**Current repo wiring:**
```text
Website "Email this plan"
   -> GET http://localhost:5678/webhook/groundwork-email
   -> n8n "Email button" Webhook trigger
   -> GET http://127.0.0.1:8000/api/v1/briefings
   -> take newest saved briefing
   -> "Email dispatcher" SMTP node

6 PM daily Schedule Trigger
   -> POST http://127.0.0.1:8000/api/v1/briefings/generate
   -> take summary
   -> same email node
```
In `agent/n8n_briefing_v3.json`, the workflow is marked `active: false` in the exported file; you must activate it after importing and configure actual recipient/sender credentials. The hardcoded `localhost` URLs refer to the **machine hosting those services**. If the site is public but n8n runs on a disconnected laptop, remote users generally cannot call `localhost:5678` on the server operator's laptop. For a publicly usable app, host n8n behind a reachable HTTPS URL or (preferably) route the button through an authenticated FastAPI endpoint that invokes the private automation.

**The email button does not need to regenerate**: it emails the *latest saved* briefing. This means check the briefing's timestamp! Otherwise a person could email yesterday's plan.

**Security:** A public GET webhook that sends email can be abused. Use authorization, rate limits and preferably a POST request from the backend; keep SMTP secrets only server-side.

## 11. The MCP server you built for Claude Desktop (important!)
**MCP = Model Context Protocol.** It's a standard that lets an AI application call tools supplied by an external program. Instead of copying a screenshot of your map into Claude, **Claude Desktop can ask your running GroundWork backend** through a local MCP server.

Your actual files:
- `agent/groundwork_mcp_v1.py` — defines an MCP server using `FastMCP` and `httpx`.
- `agent/install_claude_desktop_v1.py` — creates/updates Claude Desktop's local MCP configuration on macOS, backing up the original config first.

The MCP tools in code:
1. `list_sites(weather_state=None)` — get site scores/statuses, optionally filter by weather state.
2. `get_site(site_id)` — ask about a specific ID.
3. `latest_briefing()` — retrieve newest saved briefing.
4. `start_storm_replay()` — activate replay.
5. `stop_storm_replay()` — restore non-replay state.

**Example follow-up interaction:**
> User in Claude Desktop: “Which sites currently have STOP WORK?”  
> Claude calls `list_sites(weather_state="STOP_WORK")`.  
> MCP server sends `GET /api/v1/sites` to your running FastAPI service.  
> Backend returns JSON. Claude summarizes that result in conversational English.

This is a **real AI-tool integration**, not simply “we asked a chatbot about the repo.” The Claude model selects among exposed tools, while GroundWork calculates actual numbers. **It requires the local Python MCP process and FastAPI backend to be running.** The existing MCP module is not a public remote connector for arbitrary website users.

**Judge-ready line:** “We also exposed the system as an MCP tool server for Claude Desktop, letting users ask follow-up questions about site status and saved briefings rather than navigating every dashboard page.”

## 12. Is GroundWork agentic AI?
**Partially, when used through Claude Desktop + MCP.**
- Plain rules + Gemini narration + nightly n8n automation = **not, by themselves, an autonomous agent**.
- Claude Desktop selecting a tool, calling GroundWork and using the returned result to answer follow-up questions = **tool-using agent behavior**.
- The current MCP server provides read-only information tools *and* replay-changing tools; it is **not** a sophisticated self-directed multi-agent planner, and you should not claim one.
- An improvement would be a constrained planning assistant that can compare two sites, explain missing inputs, propose follow-up questions, and **ask a human to approve actions** (never autonomously authorize unsafe work).

## 13. What is storm replay and why did everything turn red?
**Replay = playing a recorded/simulated past event again** to show what GroundWork *would* do during a storm. It isn't today's real weather.

The repo includes a **Hurricane Milton (October 2024)** scenario, historical weather and archived alert fixtures for supported sites. Some fixture fallback alerts are simulated: the UI should clearly distinguish the real archived parts and the simulated assumptions.

When replay is active, FastAPI switches to a separate scenario instead of the current snapshot. If severe conditions/alerts apply, sites display red STOP_WORK. The **demo tray is deliberately STOP_WORK** during active replay so the beacon alarm demonstration works. In older code/demo configurations, many/all sites may turn red because a simulated storm alert or scenario state applies broadly. **That does not mean every site across Florida or the US actually had the same warning.**

Crucial finding from `site_status.py`: for a field site **without matching replay data**, the current code should show **UNKNOWN**, not invent STOP_WORK. If your map shows literally all US sites red, check whether you are in mock mode, looking at only the 60 supported Florida sites, or using an older build/version. Don't confidently tell judges all 300 locations were hit by Milton.

**Demo recipe:** Screenshot current data and note its timestamp → choose Replay → Start → show changed status and why → optionally show beacon → Exit Replay → confirm original live/cached status returns. Never pass a replay off as a current warning.

## 14. What does UNKNOWN mean?
**“We don't have enough trustworthy information to make this call.”** Examples:
- USDA returned no soil information for this point.
- Open-Meteo wind/rain data failed or is unavailable.
- NWS alert lookup failed (that's NOT the same as “no active alert”).
- Sensor reading got old/disconnected.
- No historical replay data exists for this site.

**Why important:** UNKNOWN should not default to 0 risk or GREEN. It's a prompt to obtain better data or require supervisor review. In the current backend, `weather_state=UNKNOWN` becomes effective status UNKNOWN, and missing ground inputs make per-vehicle access UNKNOWN.

## 15. Do utilities already have software like this? What is the real gap?
Utilities already use **work management, GIS, outage management, weather intelligence, inspection and dispatch software**. It would be inaccurate to claim crews always arrive unprepared and turn around. Experienced dispatchers plan for conditions; some companies already have sophisticated systems.

The plausible product gap is the **combination of site-specific soil susceptibility + forecast conditions + vehicle-class access + material logistics + explainable pre-dispatch decision** in one low-friction interface. Your prototype does **not prove** this gap is unsolved at specific utilities.

**Better pitch:** “This reduces the manual effort of cross-referencing weather, soil maps, route restrictions, vehicle choices and mat logistics before dispatch. We are not claiming the industry lacks planning tools; we are offering an integrated, explainable preliminary screening workflow.”

**Judge may ask:** “Did you interview actual dispatchers?” Answer transparently: “Not yet; validating their existing workflow is a next step.”

## 16. Should you add computer vision or other flashy features?
**Do not prioritize photo hazard detection.** Your core problem is **before crews reach the site**, not reacting after they arrive. An uploaded photo might help later verify a reported concern, but does not make tomorrow's advance site assessment much better.

Ranked enhancements:
1. **Pick any location / add a worksite:** type Miami, drop a pin or enter GPS, and compute data on demand. Biggest match to actual customer use.
2. **Access-route details:** ask route surface (paved/gravel/unpaved), length, vehicle class, ground protection inventory, and whether actual entrance is paved. Avoid false alarms at substations.
3. **Validation page:** show labeled example records with predicted/observed outcomes, threshold sensitivities and honest uncertainty.
4. **Forecast “tomorrow vs day after” planner:** choose an alternative crew day if forecast access improves (clearly forecast, not guaranteed).
5. **MCP assistant improvements:** “Compare SITE-003 and SITE-018 for heavy trucks”; “Which data are missing?”; explain scores with source links; request authorization before any actions.
6. **Satellite/GIS layers**, if time allows and licensing/georeferencing are credible: terrain slope or flood susceptibility for *screening*. Don't claim computer vision can infer load-bearing capacity from a satellite picture.
7. **PDF/email summary** as a convenience; not as important as a trustworthy location input and validation.

**Hackathon scope:** A reliable end-to-end demo is more persuasive than seven partially connected AI gimmicks.

## 17. How to test/validate this in front of judges
**Three different kinds of validation — be precise about which you have:**

**A. Software correctness:** Unit tests prove code follows the formulas and API contracts. Example cases:
- 0, 25 and 50 mm rain => 0, 2 and 4 rain points.
- Hazard threshold values around 3.5 and 6.5.
- Severe alert overrides an otherwise low score.
- Missing NWS/USDA gives UNKNOWN.
- Heavy truck classification is at least as conservative as pickup for fixed inputs.
- Replay start/stop restores normal state; replay missing-site → UNKNOWN.
- Gemini offline => safe deterministic template, not fabricated data.
- Expired snapshot or sensor => never a fresh green status.

**B. Integration/demo verification:** Check frontend in **LIVE** mode; generated brief reaches SQLite; n8n email arrives; MCP tool gives same score as website; Arduino if actually connected; run offline after loading a snapshot and verify stale labeling.

**C. Predictive/field validation (NOT accomplished by unit tests):** For real vehicle access accuracy you need actual worksite outcome labels: pass/fail, rut depth, ground bearing tests, truck type, route surface, soil observations. Compare your classifier with a simpler rain-only baseline, calculate false-GO and false-NO-GO, stratify by vehicle/region and calibrate policy thresholds. **Without field labels, honestly say prototype screening logic is not ground-truth validated.**

### Minimal table to bring to judging
| Scenario | Input | Expected | Actual observed | Evidence |
|---|---|---|---|---|
| Calm weather | 0 mm / low gust | NORMAL if NWS confirmed clear | Fill after testing | screenshot/test |
| Severe warning | NWS trigger | STOP_WORK | Fill | test |
| Missing soil | null USDA | ground access UNKNOWN | Fill | test |
| Heavy vehicle | wet site | stricter than pickup | Fill | screen |
| Gemini down | no API | template visible | Fill | screen |
| Replay exit | stop replay | restore cached/live | Fill | screen |
| n8n email | button | latest briefing emailed | Fill | email timestamp |
| MCP follow-up | Claude asks about site | correct API result | Fill | Claude result |
| Lightning report | crew report at the venue | STOP_WORK + beacon counts down from 30:00; new report restarts it | verified on the live API Oct 17 | `hardware/check_countdown_v1.py` output |
| ML forecast (learned) | held-out year, Jul 2025 to Jun 2026 | AUC 0.85 vs 0.78 for the rules; ties them on Florida sites (0.80 vs 0.81) | measured Oct 17 | `backend/ml/EVALUATION.md` |

## 18. The actual repo status: what you can and cannot claim
As of the reviewed `main` code:
- **Present in code:** FastAPI endpoints, React UI, weather/USDA/NWS refresh, deterministic hazard/access rules, mat/cost estimate, saved briefing, Gemini narration fallback, n8n workflow JSON, MCP server source, storm replay logic, SQLite, photos/reports screens and hardware integration files.
- **Added Oct 17 for the PlanIT brief:** lightning stop-work with the restarting 30-minute all clear, NIFC wildfire, iNaturalist wildlife, and the advisory ML forecast (section 7b).
- **Not verified by static code review:** that production cloud deployment works, API keys are valid, 6 PM schedule actually ran autonomously, all Arduino pieces function together in person, or any given external provider is responding right now.
- **Historical handoff notes may describe unmerged branches or local files.** The `main` repository tree is the better reference for what exists remotely; still test actual running behavior.
- **Do not pitch** universal soil engineering certification, zero hallucinations, live ground sensors at all substations, or official utility partnerships.

## 19. Frequently asked judge questions and short answers
1. **What's the problem?** “We help plan tomorrow's utility field access before crews go out.”
2. **Who uses it?** “Dispatchers and supervisors; crews may receive the plan.”
3. **How do you get locations?** “Mapped demo sites from OSM; eventually customer-entered job sites.”
4. **Can I type Miami?** “Current search filters loaded sites; on-demand geocoding is a planned feature.”
5. **How does OSM know substations?** “We filter `power=substation` tags using Overpass.”
6. **Are these real customer jobs?** “No; public geographic examples.”
7. **Are inputs real?** “Sourced forecast/soil/alerts; some demos use clearly labeled replay/simulation.”
8. **Is USDA current soil moisture?** “No, longer-term survey properties; forecast moisture/precipitation from weather models.”
9. **How does the score work?** “Explainable point rules with capped rain, wind and heat terms.”
10. **Why two decisions?** “Storm safety affects everyone; ground access differs by vehicle.”
11. **Why heavier truck more conservative?** “Vehicle load/ground impact differs; our cutoffs are demonstrative, not certified.”
12. **Why 7 days?** “Ground stays wet after rain; the window is a heuristic to test and calibrate.”
13. **Why min(10)?** “To keep the rating on a 0–10 scale; input components already have individual caps.”
14. **Why unknown?** “Missing critical evidence must never be called safe.”
15. **What are mats?** “Temporary ground protection panels; we estimate quantities, not bearing capacity.”
16. **What do costs show?** “User-entered what-if math; not independently verified savings.”
17. **What does Gemini do?** “Writes a readable summary; Python decides scores.”
18. **What if Gemini fails?** “A deterministic template still renders.”
19. **Is this agentic?** “Claude Desktop can use our MCP tools for follow-up site questions; core safety is rules.”
20. **What's n8n?** “A scheduler/webhook workflow that emails the saved or newly generated briefing.”
21. **What's SMTP?** “The email-sending protocol used by our automation.”
22. **What's a production webhook?** “The live n8n URL, separate from an editor test-only URL.”
23. **What is storm replay?** “A labeled historical/simulated stress test, not today's forecast.”
24. **Why is the map red?** “Replay may force STOP WORK on affected fixture sites; unsupported sites should be UNKNOWN.”
25. **What if APIs go down?** “Use timestamped cache for continuity; stale/missing data triggers review, not fake live green.”
26. **How validated?** “Rule/test correctness and an integration demo; field predictive accuracy still requires worksite labels.”
27. **Do other tools exist?** “Yes, but we're integrating soil, vehicle access, weather and logistics in one explainable view.”
28. **Biggest limitation?** “Mapped site pin is not the exact access path; soil survey isn't a bearing-strength measurement.”
29. **Biggest next feature?** “User-added worksite with pin and actual route conditions.”
30. **What did you build personally?** “Risk intelligence, environmental-data work, briefing/Gemini, MCP Claude integration and n8n automation; specify actual tested contributions.”

## 20. GitHub / terminal checks (paste the RESULTS to me)
Run from the **repo root** (the folder containing `backend/`, `frontend/`, `agent/`). These commands do **not** change code. They check what's actually in your checked-out branch. On macOS, `grep` is already installed; `rg`/ripgrep is optional.

```bash
pwd
git status --short --branch
git log -1 --oneline
git branch -a
```

**Location input and OSM:**
```bash
grep -RInE 'power.*substation|BBOX|geocod|search|needle|load_sites' prototype/get_sites.py scripts/get_sites_us_v*.py backend/app/services/sites.py frontend/src/screens/ops-map/OpsMapScreen.tsx 2>/dev/null | head -80
```

**Hazard formula and missing-data behavior:**
```bash
grep -nE 'HAZARD_POLICY|ground_wetness|hazard_parts|def assess|def access_for|UNKNOWN|stop_work_from|caution_from' backend/app/services/hazard.py
grep -nE 'STALE_AFTER|PAST_DAYS|SNAPSHOT_PATH|fetch_observations|fetch_alerts_and_soil' backend/app/services/weather.py
```

**Briefings/Gemini/website/email:**
```bash
grep -RInE 'generate_briefing|narrative_source|GEMINI_|briefings/generate|EmailBriefingButton|VITE_N8N_EMAIL_URL' backend/app frontend/src/screens/briefing agent 2>/dev/null | head -110
grep -nE '"active"|"path"|"cronExpression"|"url"|"toEmail"' agent/n8n_briefing_v3.json
```

**MCP:**
```bash
grep -nE '@mcp.tool|^def |^BASE|mcp.run' agent/groundwork_mcp_v1.py
grep -nE 'claude_desktop_config|mcpServers|groundwork' agent/install_claude_desktop_v1.py
```

**Replay/hardware/mock/live checks:**
```bash
grep -RInE 'NO_REPLAY_DATA|replay_active|weather_state = "STOP_WORK"|scenario_file|mode.*replay' backend/app/services/site_status.py backend/app/services/storm_replay_v2.py | head -80
grep -RInE 'VITE_API_MODE|API_MODE|mock|live' frontend/src/api/config.ts frontend/README.md | head -60
find hardware firmware -maxdepth 3 -type f | sort
```

**Tests, with dependencies installed (don't run destructive reset scripts):**
```bash
python -m pytest backend/tests -q
python -m unittest discover tests
cd frontend && npm test -- --run
```

**Optional API smoke test (requires backend running locally):**
```bash
curl -s http://localhost:8000/api/v1/health
curl -s 'http://localhost:8000/api/v1/sites?limit=2'
curl -s 'http://localhost:8000/api/v1/briefings?limit=1'
```
Avoid `POST /replay/start`, `POST /briefings/generate`, or `/demo/reset` in casual checks: they mutate shared/demo state or create records.

**Do not paste** `.env`, API keys, SMTP app passwords, tokens, database contents with private information or personal emails.

### What I will audit from those results
- Whether public `main` and your local branch match.
- Whether UI actually supports arbitrary city/site entry.
- Whether frontend is in mock or live mode.
- Whether the formulas and API fields agree.
- Whether n8n workflow is active and email URL is reachable (**cannot prove active status from committed JSON alone**).
- Whether MCP tools load and the backend runs.
- Whether replay and missing-data behavior match what the website shows.
- What the test suites really passed today (not just what a handoff memo says).

## 21. A reliable two-minute demo script
> **Use README §14.4 on stage.** It is the team's current two-minute script, with who says what and the demo site; this older outline is kept for reference.

**0–20 sec:** “Utilities must plan tomorrow's site access. Weather alone doesn't reveal wet-ground access problems for different vehicle types.”  
**20–40 sec:** Open the map, click a site, explain sources and timestamps. “These are public demo locations, not a utility's private assignments.”  
**40–65 sec:** Switch pickup vs heavy truck. Explain Decision A vs Decision B, UNKNOWN and mat calculation.  
**65–85 sec:** Open the 6 PM Brief. Show ranked sites, source labels, Gemini or deterministic label.  
**85–100 sec:** Use the n8n email button *if the workflow has been verified*.  
**100–115 sec:** Show Claude Desktop asking “Which sites are STOP_WORK and why?” via MCP, *if connected*.  
**Lightning (if the beacon is connected, ~15 sec):** submit a “lightning observed” report at the venue; the beacon alarms and counts down 30:00. “Every site within 10 miles stops; each new strike restarts the 30 minutes, as Sperry's brief asks. Crew-reported, not a strike network.”  
**115–120 sec:** “Everything is a preliminary screening recommendation; the human supervisor makes the final call.”

Only run Replay/Arduino in the middle if it is rehearsed; always label scenarios and restore current mode.

## 22. Remaining priorities (in order)
1. **Validate the live end-to-end experience** and make timestamps/mode clear everywhere.
2. **Fix location realism**: allow exact supervisor-entered worksite GPS/access-route selection rather than implying substation ground is unpaved.
3. **Test two-vehicle contrast** for a representative wet-ground case, with input source labels.
4. **Verify replay coverage** so unsupported sites are UNKNOWN instead of all turning red.
5. **Verify 6 PM automation and secured webhook** on the real deployed environment, not laptop-only `localhost`.
6. **Show test evidence** and be explicit about no field-validated safety thresholds.
7. **Demonstrate MCP as a working connector**, if stable; it is more differentiated than gratuitous computer vision.
8. Only after these, consider PDF export, schedule comparison or GIS enhancements.

---
### Key source files
- `backend/app/services/hazard.py` — actual weather and ground-access formulas
- `backend/app/services/weather.py` — Open-Meteo, USDA, NWS and snapshot refresh
- `backend/app/services/site_status.py` — effective statuses and replay behavior
- `backend/app/services/briefings.py` + `narration.py` — summaries and Gemini fallback
- `backend/app/services/mats.py` + `cost.py` — quantities and cost scenarios
- `frontend/src/screens/ops-map/OpsMapScreen.tsx` — current search/filter functionality
- `frontend/src/screens/briefing/EmailBriefingButton.tsx` — webhook call
- `agent/n8n_briefing_v3.json` — scheduled and button-triggered emails
- `agent/groundwork_mcp_v1.py` — Claude Desktop connector tools
- `agent/install_claude_desktop_v1.py` — local MCP installation
- `get_sites.py` — OSM Overpass `power=substation` filtering
