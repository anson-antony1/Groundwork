// UI-only state shared by every screen. Server data lives in TanStack Query, never here.
import { createContext, useContext } from 'react'
import type { Vehicle } from '../api/types'

export interface DemoUi {
  /** Planning vehicle for the map and site detail. The physical beacon always evaluates the heavy truck. */
  vehicle: Vehicle
  setVehicle: (v: Vehicle) => void
}

export const DemoUiContext = createContext<DemoUi | null>(null)

export function useDemoUi(): DemoUi {
  const ctx = useContext(DemoUiContext)
  if (!ctx) throw new Error('useDemoUi must be used inside DemoUiProvider')
  return ctx
}
