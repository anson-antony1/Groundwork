import type { LucideIcon } from 'lucide-react'
import { CircleDot, CloudRain, Droplets, Gauge, Layers3, Siren, Sun, Thermometer, Umbrella, Wind } from 'lucide-react'

const FIELD_ICONS: Record<string, LucideIcon> = {
  rain_7d: CloudRain,
  rain_forecast: Umbrella,
  gust_forecast: Wind,
  apparent_temp: Thermometer,
  nws_alerts: Siren,
  usda_soil: Layers3,
  usda_clay_pct: Layers3,
  demo_tray_moisture: Droplets,
  moisture_index: Droplets,
  light_index: Sun,
  pressure_hpa: Gauge,
  temp_c: Thermometer,
}

/** Icon for a backend field/variable name, with a neutral fallback. */
export function fieldIcon(name: string): LucideIcon {
  return FIELD_ICONS[name] ?? CircleDot
}
