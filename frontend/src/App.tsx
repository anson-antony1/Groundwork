import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Construction } from 'lucide-react'
import { Link, Route, Switch } from 'wouter'
import { AppShell } from './components/AppShell'
import { Card } from './components/Card'
import { StyleScreen } from './screens/style/StyleScreen'
import { DemoUiProvider } from './state/DemoUiProvider'

const queryClient = new QueryClient()

function Pending({ title, checkpoint }: { title: string; checkpoint: number }) {
  return (
    <Card title={title} icon={<Construction aria-hidden className="size-4" />} className="mx-auto max-w-3xl">
      <p className="text-lg">
        This screen lands at checkpoint {checkpoint}. Meanwhile, the{' '}
        <Link href="/style" className="text-accent underline underline-offset-4">
          style tile
        </Link>{' '}
        shows the design system.
      </p>
    </Card>
  )
}

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
      <DemoUiProvider>
        <AppShell>
          <Switch>
            <Route path="/">
              <Pending title="Operations map" checkpoint={1} />
            </Route>
            <Route path="/sites/:siteId">
              <Pending title="Site detail" checkpoint={2} />
            </Route>
            <Route path="/sensor-lab">
              <Pending title="Sensor lab" checkpoint={4} />
            </Route>
            <Route path="/replay">
              <Pending title="Storm replay" checkpoint={3} />
            </Route>
            <Route path="/briefing">
              <Pending title="6 PM briefing" checkpoint={7} />
            </Route>
            <Route path="/report/:siteId?">
              <Pending title="Crew hazard report" checkpoint={5} />
            </Route>
            <Route path="/style" component={StyleScreen} />
            <Route>
              <NotFound />
            </Route>
          </Switch>
        </AppShell>
      </DemoUiProvider>
    </QueryClientProvider>
  )
}
