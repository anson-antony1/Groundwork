import type { ReactNode } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Vehicle } from '../api/types'
import { DemoUiContext } from './demoUiContext'

const VEHICLE_KEY = 'groundwork.vehicle'

function readVehicle(): Vehicle {
  try {
    return localStorage.getItem(VEHICLE_KEY) === 'heavy_truck' ? 'heavy_truck' : 'pickup'
  } catch {
    return 'pickup'
  }
}

export function DemoUiProvider({ children }: { children: ReactNode }) {
  const [vehicle, setVehicleState] = useState<Vehicle>(readVehicle)

  const setVehicle = useCallback((v: Vehicle) => {
    setVehicleState(v)
    try {
      localStorage.setItem(VEHICLE_KEY, v)
    } catch {
      // Private window or blocked storage: the choice still applies for this page.
    }
  }, [])

  // Keep extra tabs in step if someone opens more than one.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === VEHICLE_KEY) setVehicleState(readVehicle())
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo(() => ({ vehicle, setVehicle }), [vehicle, setVehicle])
  return <DemoUiContext.Provider value={value}>{children}</DemoUiContext.Provider>
}
