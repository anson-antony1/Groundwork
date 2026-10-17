import { QueryClientProvider } from '@tanstack/react-query'
import { Suspense, lazy } from 'react'
import { Link, Route, Switch } from 'wouter'
import { API_MODE } from './api/config'
import { queryClient } from './api/queryClient'
import { ServerCtxProvider } from './api/ServerCtxProvider'
import { loadMockControls } from './api/transport'
import { AppShell } from './components/AppShell'
import { Card } from './components/Card'
import { BriefingScreen } from './screens/briefing/BriefingScreen'
import { OpsMapScreen } from './screens/ops-map/OpsMapScreen'
import { ReplayScreen } from './screens/replay/ReplayScreen'
import { ReportScreen } from './screens/report/ReportScreen'
import { SensorLabScreen } from './screens/sensor-lab/SensorLabScreen'
import { SiteDetailScreen } from './screens/site-detail/SiteDetailScreen'
import { StyleScreen } from './screens/style/StyleScreen'
import { DemoUiProvider } from './state/DemoUiProvider'

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

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ServerCtxProvider>
        <DemoUiProvider>
          <AppShell>
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
          </AppShell>
          {MockControls && (
            <Suspense fallback={null}>
              <MockControls />
            </Suspense>
          )}
        </DemoUiProvider>
      </ServerCtxProvider>
    </QueryClientProvider>
  )
}
