import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy, useEffect } from 'react'
import { Link, Route, Switch } from 'wouter'
import { API_MODE } from './api/config'
import { queryClient } from './api/queryClient'
import { ServerCtxProvider } from './api/ServerCtxProvider'
import { loadMockControls } from './api/transport'
import { AppShell } from './components/AppShell'
import { Card } from './components/Card'
import { LoadingBlock } from './components/States'
import { OpsMapScreen } from './screens/ops-map/OpsMapScreen'
import { SiteDetailScreen } from './screens/site-detail/SiteDetailScreen'
import { DemoUiProvider } from './state/DemoUiProvider'

// Secondary screens load on demand (Recharts is only needed by the Sensor Lab) and are prefetched
// shortly after start-up, so the first jump to them during the demo is still instant.
const loadSensorLab = () => import('./screens/sensor-lab/SensorLabScreen')
const loadReplay = () => import('./screens/replay/ReplayScreen')
const loadBriefing = () => import('./screens/briefing/BriefingScreen')
const loadReport = () => import('./screens/report/ReportScreen')
const SensorLabScreen = lazy(() => loadSensorLab().then((m) => ({ default: m.SensorLabScreen })))
const ReplayScreen = lazy(() => loadReplay().then((m) => ({ default: m.ReplayScreen })))
const BriefingScreen = lazy(() => loadBriefing().then((m) => ({ default: m.BriefingScreen })))
const ReportScreen = lazy(() => loadReport().then((m) => ({ default: m.ReportScreen })))
const StyleScreen = lazy(() => import('./screens/style/StyleScreen').then((m) => ({ default: m.StyleScreen })))
const WelcomeScreen = lazy(() => import('./screens/welcome/WelcomeScreen').then((m) => ({ default: m.WelcomeScreen })))

function usePrefetchScreens() {
  useEffect(() => {
    const prefetch = () => [loadSensorLab, loadReplay, loadBriefing, loadReport].forEach((load) => void load())
    const timer = window.setTimeout(prefetch, 2000)
    return () => window.clearTimeout(timer)
  }, [])
}

// Rehearsal panel exists only in mock mode; live builds never load it.
const MockControls = API_MODE === 'mock' ? lazy(loadMockControls) : null

function NotFound() {
  return (
    <Card title="Not found" className="mx-auto max-w-3xl">
      <p className="text-lg">
        No screen here.{' '}
        <Link href="/" className="text-accent underline underline-offset-4">
          Back to the map
        </Link>
      </p>
    </Card>
  )
}

/** The operations console: everything behind the top bar, polling the server's live/replay context. */
function OpsApp() {
  return (
      <ServerCtxProvider>
        <DemoUiProvider>
          <AppShell>
            <Suspense fallback={<LoadingBlock label="Loading screen" />}>
            <Switch>
              <Route path="/" component={OpsMapScreen} />
              <Route path="/sites/:siteId">{(params) => <SiteDetailScreen key={params.siteId} siteId={params.siteId} />}</Route>
              <Route path="/sensor-lab" component={SensorLabScreen} />
              <Route path="/replay" component={ReplayScreen} />
              <Route path="/briefing" component={BriefingScreen} />
              <Route path="/report/:siteId?">{(params) => <ReportScreen siteId={params.siteId} />}</Route>
              <Route path="/style" component={StyleScreen} />
              <Route>
                <NotFound />
              </Route>
            </Switch>
            </Suspense>
          </AppShell>
          {MockControls && (
            <Suspense fallback={null}>
              <MockControls />
            </Suspense>
          )}
        </DemoUiProvider>
      </ServerCtxProvider>
  )
}

export function App() {
  usePrefetchScreens()
  return (
    <QueryClientProvider client={queryClient}>
      <Switch>
        {/* The public front door renders without the ops shell: no STOP bar, polling or hotkeys. */}
        <Route path="/welcome">
          <Suspense fallback={<LoadingBlock label="Loading" />}>
            <WelcomeScreen />
          </Suspense>
        </Route>
        <Route>
          <OpsApp />
        </Route>
      </Switch>
    </QueryClientProvider>
  )
}
