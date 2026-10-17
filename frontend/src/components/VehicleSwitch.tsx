import { CarFront, Truck } from 'lucide-react'
import type { Vehicle } from '../api/types'
import { VEHICLE_LABEL } from '../domain/format'
import { useDemoUi } from '../state/demoUiContext'
import { Segmented } from './Segmented'

const OPTIONS = [
  { value: 'pickup', label: VEHICLE_LABEL.pickup, icon: <CarFront aria-hidden className="size-[1.2em]" /> },
  { value: 'heavy_truck', label: VEHICLE_LABEL.heavy_truck, icon: <Truck aria-hidden className="size-[1.2em]" /> },
] as const

/** Planning vehicle. Switching it changes access calls, never the weather hazard score. */
export function VehicleSwitch({ size = 'md', className }: { size?: 'md' | 'lg'; className?: string }) {
  const { vehicle, setVehicle } = useDemoUi()
  return (
    <Segmented<Vehicle>
      label="Planning vehicle"
      value={vehicle}
      options={OPTIONS}
      onChange={setVehicle}
      size={size}
      className={className}
    />
  )
}
