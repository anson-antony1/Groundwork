import type { LucideIcon } from 'lucide-react'
import { ArrowRight, CloudLightning, FileText, Map as MapIcon, Radio, Server, Truck } from 'lucide-react'
import type { ReactNode } from 'react'
import { Link } from 'wouter'
import { API_MODE, DEMO_URL } from '../../api/config'
import { Wordmark } from '../../components/Logo'
import { LABELS } from '../../domain/provenance'
import { LiveSystemChip } from './LiveSystemChip'
import { StormHero } from './StormHero'

const PILLARS: { icon: LucideIcon; title: string; scope: string; text: string }[] = [
  {
    icon: CloudLightning,
    title: 'Weather safety',
    scope: 'Every vehicle',
    text: 'A 0–10 hazard score from rain, gusts and heat. A thunderstorm, hurricane or flood warning forces STOP WORK, and a failed alert check is never treated as safe.',
  },
  {
    icon: Truck,
    title: 'Ground access',
    scope: 'Each vehicle',
    text: 'Soft ground gets its own call for a pickup and for a heavy truck: GO, MATS or NO-GO, each one for a supervisor to confirm.',
  },
  {
    icon: FileText,
    title: 'The 6 PM plan',
    scope: 'Tomorrow',
    text: 'Sites ranked for tomorrow with mat ranges and the cost of waiting, plus a summary written from the structured records.',
  },
]

const FLOW: { icon: LucideIcon; title: string; text: string }[] = [
  { icon: Radio, title: 'Site beacon', text: 'A soil-moisture tray at the venue reports every second and shows the server’s call on its LCD.' },
  { icon: Server, title: 'Groundwork API', text: 'Scores weather and ground access for 300 real substations with prototype policy rules.' },
  { icon: MapIcon, title: 'Ops console', text: 'The ranked map, site detail, storm replay and the STOP WORK override.' },
  { icon: FileText, title: '6 PM brief', text: 'A plan for tomorrow, narrated by Gemini from the records, with a template fallback.' },
]

const TEAM: [string, string][] = [
  ['Rishi', 'Frontend'],
  ['Aashita', 'Backend, mats and cost'],
  ['Rithika', 'Risk logic and the 6 PM brief'],
  ['Anson', 'Beacon hardware'],
]

const BUTTON = 'inline-flex min-h-12 items-center gap-2 rounded-[3px] px-5 text-[0.95rem] label-caps'

/** On the live site the interactive beacon lives on the demo site; everywhere else it's this site's Demo Tray tab. */
function BeaconDemoLink() {
  const className = `${BUTTON} border-2 border-line-hi text-ink hover:bg-steel-hi`
  if (API_MODE === 'live' && DEMO_URL) {
    return (
      <a href={`${DEMO_URL}/demo-tray`} className={className}>
        Try the beacon demo
      </a>
    )
  }
  return (
    <Link href="/demo-tray" className={className}>
      Try the beacon demo
    </Link>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-4">
      <h2 className="text-[0.85rem] text-muted label-caps">{title}</h2>
      {children}
    </section>
  )
}

/** Public front door (/welcome): what Groundwork does, in one storm loop. Lives outside the ops shell. */
export function WelcomeScreen() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line bg-panel/90">
        <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Wordmark />
          <span className="hidden text-[0.78rem] text-muted label-caps md:block">SwampHacks XII · Sperry Tech challenge</span>
          <Link href="/" className="inline-flex min-h-11 items-center gap-2 text-[0.85rem] text-accent label-caps">
            Ops console <ArrowRight aria-hidden className="size-4" />
          </Link>
        </div>
      </header>

      <main className="mx-auto flex max-w-[1400px] flex-col gap-12 px-4 py-8 sm:px-6 lg:gap-16 lg:py-12">
        <section className="grid items-center gap-8 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-10">
          <div className="flex flex-col gap-5">
            <p className="text-[0.82rem] text-muted label-caps">Utility field operations · plan by 6 PM</p>
            <h1 className="font-display text-[clamp(2.6rem,5.4vw,4.4rem)] leading-[0.95] font-bold tracking-wide text-balance uppercase">
              Which sites can crews reach tomorrow?
            </h1>
            <p className="max-w-[46ch] text-lg text-muted">
              Groundwork checks weather safety for every vehicle and ground access for each one, then ranks tomorrow’s
              sites before the 6 PM call.
            </p>
            <div className="flex flex-wrap gap-3">
              <Link href="/" className={`${BUTTON} bg-accent text-accent-ink hover:bg-accent/90`}>
                Open ops console <ArrowRight aria-hidden className="size-5" />
              </Link>
              <BeaconDemoLink />
            </div>
            <LiveSystemChip />
          </div>
          <figure className="flex flex-col gap-2">
            <StormHero className="aspect-[4/3] w-full rounded-[4px] border border-line sm:aspect-[330/226]" />
            <figcaption className="text-[0.82rem] text-muted">
              Illustration: the real locations of the 60 Florida substations, with a simulated storm. The app itself only shows
              statuses the API returns.
            </figcaption>
          </figure>
        </section>

        <Section title="Two separate calls, one plan">
          <div className="grid gap-4 md:grid-cols-3">
            {PILLARS.map(({ icon: Icon, title, scope, text }) => (
              <div key={title} className="flex flex-col gap-3 rounded-[4px] border border-line bg-panel p-5">
                <span className="flex items-center gap-2.5">
                  <Icon aria-hidden className="size-6 text-muted" />
                  <span className="font-display text-xl font-bold uppercase">{title}</span>
                  <span className="ml-auto rounded-[2px] border border-line-hi px-2 py-1 text-[0.68rem] text-muted label-caps">{scope}</span>
                </span>
                <p className="text-muted">{text}</p>
              </div>
            ))}
          </div>
        </Section>

        <Section title="How it fits together">
          <ol className="grid gap-px overflow-hidden rounded-[4px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {FLOW.map(({ icon: Icon, title, text }, i) => (
              <li key={title} className="flex flex-col gap-2 bg-bg p-5">
                <span className="flex items-center gap-2.5 font-display text-lg font-bold uppercase">
                  <span className="text-[0.85rem] text-faint num">{i + 1}</span>
                  <Icon aria-hidden className="size-5 text-accent" />
                  {title}
                </span>
                <p className="text-[0.95rem] text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </Section>

        <Section title="What’s real and what isn’t">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-[4px] border border-line bg-panel p-5">
              <p className="mb-2 font-semibold">Real</p>
              <p className="text-muted">
                300 OpenStreetMap power substations: 60 from Orlando to Jacksonville and 240 across the US. Open-Meteo weather,
                NWS alerts and USDA soil drainage. Storm replays use the archived weather and the NWS alerts that were in force
                that day.
              </p>
            </div>
            <div className="rounded-[4px] border border-dashed border-line-hi p-5">
              <p className="mb-2 font-semibold">Simulated or assumed</p>
              <p className="text-muted">
                Every status on the mock demo link. The tray beacon, a demo sensor at the venue rather than an on-site
                measurement. The safety thresholds: {LABELS.prototypePolicy.toLowerCase()}.
              </p>
            </div>
          </div>
        </Section>

        <footer className="flex flex-col gap-4 border-t border-line pt-6 sm:flex-row sm:items-end sm:justify-between">
          <ul className="flex flex-wrap gap-x-6 gap-y-2">
            {TEAM.map(([name, role]) => (
              <li key={name}>
                <span className="font-semibold">{name}</span> <span className="text-muted">· {role}</span>
              </li>
            ))}
          </ul>
          <p className="text-[0.85rem] text-faint">Hackathon prototype · not certified safety guidance</p>
        </footer>
      </main>
    </div>
  )
}
