import { ArrowRight, Eye, HardHat, LockKeyhole, LogIn, UserPlus, UserRoundCheck } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Redirect, useLocation, useSearch } from 'wouter'
import { useSession } from '../../auth/session'
import { chooseViewer, nextPath } from '../../auth/viewer'
import { Wordmark } from '../../components/Logo'

const ROLES: readonly { icon: LucideIcon; title: string; tone: string; text: string }[] = [
  { icon: Eye, title: 'Viewer', tone: 'text-muted', text: 'No account. See the map, every site’s call, the demo tray and storm replays.' },
  { icon: HardHat, title: 'Crew', tone: 'text-caution', text: 'Everything a viewer sees, plus sending hazard reports from the field: photos, lightning, flooding.' },
  { icon: UserRoundCheck, title: 'Supervisor', tone: 'text-accent', text: 'Everything crew can do, plus reviewing reports, planning mats and cost, and making the 6 PM plan.' },
]

/**
 * The front door when Auth0 is on: log in, create an account, or look around as a viewer. Both sign-in
 * buttons go to Auth0 Universal Login; the app only ever receives tokens, never a password.
 */
export function LoginScreen() {
  const session = useSession()
  const [, navigate] = useLocation()
  const next = nextPath(useSearch())

  if (session.loggedIn) return <Redirect to={next} replace />

  const viewer = () => {
    chooseViewer()
    navigate(next, { replace: true })
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-[4.25rem] shrink-0 items-center border-b-2 border-line bg-gradient-to-b from-[#20262d] to-[#171b20] px-5">
        <Wordmark />
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 border-b border-line bg-steel px-5 py-2 text-[0.85rem]">
        <span className="rounded-[2px] bg-ink px-2 py-0.5 text-[0.8rem] text-bg label-caps">Demo mode</span>
        <span>Prototype, not certified safety guidance · a supervisor makes the final call</span>
      </div>

      <main className="flex-1 bg-[radial-gradient(ellipse_at_20%_0%,rgb(79_179_217/0.08),transparent_60%)]">
        <div className="mx-auto grid max-w-[1180px] gap-9 px-5 py-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:px-11 lg:py-14">
          <section>
            <p className="font-semibold text-accent label-caps">Utility crew planning</p>
            <h1 className="mt-1.5 font-display text-[2.6rem] leading-none font-bold tracking-wide uppercase sm:text-[3.1rem]">Know which crews can go tomorrow</h1>
            <p className="mt-3 max-w-[36rem] text-lg text-muted">
              Every evening Groundwork checks tomorrow’s weather, the ground and live site sensors for 300 sites, and tells supervisors which vehicles can get in,
              which need mats, and where work must stop.
            </p>
            <h2 className="mt-7 mb-2.5 text-[0.85rem] font-semibold text-muted label-caps">What each sign-in can do</h2>
            <ul className="grid gap-3 md:grid-cols-3">
              {ROLES.map(({ icon: Icon, title, tone, text }) => (
                <li key={title} className="rounded-[4px] border border-line bg-panel p-3.5">
                  <p className="flex items-center gap-2 font-bold label-caps">
                    <Icon aria-hidden className={`size-5 ${tone}`} /> {title}
                  </p>
                  <p className="mt-1.5 text-[0.9rem] text-muted">{text}</p>
                </li>
              ))}
            </ul>
          </section>

          <section aria-labelledby="sign-in" className="self-start rounded-[4px] border border-line-hi bg-panel p-6 shadow-[0_14px_32px_rgb(0_0_0/0.45)]">
            <h2 id="sign-in" className="font-display text-[1.6rem] font-bold uppercase">
              Sign in
            </h2>
            {session.configured ? (
              <>
                <p className="mt-1 mb-5 text-muted">Your role comes with your account.</p>
                <button
                  type="button"
                  onClick={() => session.login(next)}
                  disabled={!session.ready}
                  className="flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[3px] bg-accent text-lg text-accent-ink label-caps disabled:opacity-60"
                >
                  <LogIn aria-hidden className="size-5" /> Log in
                </button>
                <button
                  type="button"
                  onClick={() => session.signup(next)}
                  disabled={!session.ready}
                  className="mt-2.5 flex min-h-14 w-full items-center justify-center gap-2.5 rounded-[3px] border-2 border-line-hi text-lg label-caps hover:bg-steel-hi disabled:opacity-60"
                >
                  <UserPlus aria-hidden className="size-5" /> Create an account
                </button>
                <p className="my-3.5 flex items-center gap-2.5 text-[0.8rem] text-faint before:h-px before:flex-1 before:bg-line after:h-px after:flex-1 after:bg-line">or</p>
              </>
            ) : (
              <p className="mt-1 mb-5 text-muted">Login isn’t set up on this copy of Groundwork, so everyone can use every part of the demo.</p>
            )}
            <button type="button" onClick={viewer} className="flex w-full items-center justify-center gap-1.5 py-1.5 text-accent label-caps hover:underline">
              Continue as viewer <ArrowRight aria-hidden className="size-4" />
            </button>
            <p className="mt-4 flex gap-2 border-t border-line pt-3 text-[0.82rem] text-muted">
              <LockKeyhole aria-hidden className="mt-0.5 size-4 shrink-0" />
              Sign-in is handled by Auth0. Groundwork never sees your password; it only gets a signed token saying who you are and your role, which the server checks on
              every change.
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
