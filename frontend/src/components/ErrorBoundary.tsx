import { Component } from 'react'
import type { ReactNode } from 'react'
import { ErrorBlock } from './States'
import { isStaleBuildError, reloadForNewBuild } from './staleBuild'

const UPDATED = new Error('Groundwork was updated while this tab was open. Retry loads the new version.')

interface Props {
  children: ReactNode
  /** Clears the error when it changes (the URL path), so navigating to another screen recovers. */
  resetKey?: string
}

interface State {
  error: unknown
  resetKey?: string
}

/** A screen that throws, or whose files fail to load, shows an error here; the top bar and navigation keep working. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, resetKey: this.props.resetKey }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey === state.resetKey ? null : { error: null, resetKey: props.resetKey }
  }

  static getDerivedStateFromError(error: unknown): Partial<State> {
    return { error }
  }

  componentDidCatch(error: unknown) {
    if (isStaleBuildError(error)) reloadForNewBuild()
  }

  render() {
    const { error } = this.state
    if (error === null) return this.props.children
    return (
      <ErrorBlock
        title="This screen couldn't load"
        error={isStaleBuildError(error) ? UPDATED : error}
        onRetry={() => window.location.reload()}
        className="mx-auto max-w-3xl"
      />
    )
  }
}
