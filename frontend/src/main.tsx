// Fonts are bundled locally so the demo works with no network (README P14).
import '@fontsource/barlow/400.css'
import '@fontsource/barlow/500.css'
import '@fontsource/barlow/600.css'
import '@fontsource/barlow/700.css'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/vt323/400.css'
import 'leaflet/dist/leaflet.css'
import './styles/theme.css'
import './styles/print.css'

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { reloadForNewBuild } from './components/staleBuild'

// Vite reports here when a screen's files fail to preload, e.g. after a deploy renamed them. Reloading picks
// up the new build; preventDefault keeps the error from reaching the error boundary in the meantime.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadForNewBuild()) event.preventDefault()
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
