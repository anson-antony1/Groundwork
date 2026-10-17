import { LogIn, LogOut, UserRound } from 'lucide-react'
import { roleLabel, useSession } from './session'

/** Log in / who's logged in / log out, in the top bar. Hidden when this build has no Auth0 login. */
export function AccountButton() {
  const session = useSession()
  if (!session.configured || !session.ready) return null
  if (!session.loggedIn) {
    return (
      <button
        type="button"
        onClick={session.login}
        className="flex min-h-10 shrink-0 items-center gap-2 rounded-[3px] border-2 border-accent px-3 text-[0.85rem] text-accent label-caps hover:bg-accent/10"
      >
        <LogIn aria-hidden className="size-4" /> Log in
      </button>
    )
  }
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="hidden items-center gap-2 rounded-[3px] border border-line-hi px-2.5 py-1.5 text-[0.8rem] sm:flex" title={session.name ?? undefined}>
        <UserRound aria-hidden className="size-4 text-muted" />
        <span className="max-w-[10rem] truncate">{session.name}</span>
        <span className="text-muted label-caps">· {roleLabel(session.roles)}</span>
      </span>
      <button
        type="button"
        onClick={session.logout}
        className="flex min-h-10 items-center gap-2 rounded-[3px] border-2 border-line-hi px-3 text-[0.85rem] label-caps hover:bg-steel-hi"
      >
        <LogOut aria-hidden className="size-4" /> Log out
      </button>
    </span>
  )
}

/** In place of a supervisor-only control: says who can do it, with a login button when that would help. */
export function SupervisorOnly({ what, roles = 'a supervisor' }: { what: string; roles?: string }) {
  const session = useSession()
  return (
    <span className="flex flex-wrap items-center gap-3 text-[0.9rem] text-muted">
      <span>
        Log in as {roles} to {what}.
      </span>
      {session.configured && !session.loggedIn && (
        <button type="button" onClick={session.login} className="flex min-h-10 items-center gap-2 rounded-[3px] border-2 border-accent px-3 text-[0.85rem] text-accent label-caps hover:bg-accent/10">
          <LogIn aria-hidden className="size-4" /> Log in
        </button>
      )}
    </span>
  )
}
