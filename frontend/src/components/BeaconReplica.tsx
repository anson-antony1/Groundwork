import { BellRing, Hand, MousePointerClick, VolumeX } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Display } from '../api/types'
import { fmtClock } from '../domain/format'
import { LABELS } from '../domain/provenance'
import { beaconVisual } from '../domain/status'
import type { Backlight, LedState } from '../domain/status'
import { useReducedMotion } from '../hooks/useReducedMotion'
import { cx } from './cx'

const NBSP = String.fromCharCode(160)

const BACKLIGHT: Record<Backlight, string> = {
  green: 'bg-lcd-green shadow-[0_0_44px_6px_rgb(126_226_161/0.35)]',
  amber: 'bg-lcd-amber shadow-[0_0_44px_6px_rgb(255_196_107/0.35)]',
  red: 'bg-lcd-red shadow-[0_0_44px_8px_rgb(255_123_112/0.45)]',
  white: 'bg-lcd-white shadow-[0_0_36px_4px_rgb(233_238_242/0.25)]',
}

const LED_ON = {
  red: 'bg-[radial-gradient(circle_at_35%_30%,#ffd5d1,#ff3b30_45%,#8a0f0a)] shadow-[0_0_20px_7px_rgb(255_59_48/0.6)]',
  green: 'bg-[radial-gradient(circle_at_35%_30%,#d8ffe7,#2fbf71_45%,#0b5a30)] shadow-[0_0_20px_7px_rgb(47_191_113/0.55)]',
}
const LED_OFF = { red: 'bg-[#3b1614]', green: 'bg-[#0f2d1d]' }

function Led({ color, state }: { color: 'red' | 'green'; state: LedState }) {
  const lit = state !== 'off'
  const motion =
    state === 'blink' ? 'animate-led-blink' : state === 'alternate' ? (color === 'red' ? 'animate-led-alt-a' : 'animate-led-alt-b') : ''
  return (
    <div className="flex flex-col items-center gap-2">
      <span
        aria-hidden
        className={cx('size-10 rounded-full border-2 border-black/70', lit ? LED_ON[color] : LED_OFF[color], lit && motion)}
      />
      {/* Text state so the LEDs are readable without color. */}
      <span className="text-[0.72rem] text-muted label-caps">
        {color} · {state}
      </span>
    </div>
  )
}

function Screw({ className }: { className: string }) {
  return (
    <span aria-hidden className={cx('absolute size-3 rounded-full bg-[#3a424b] shadow-[inset_0_1px_1px_rgb(0_0_0/0.6)]', className)}>
      <span className="absolute inset-x-0.5 top-1/2 h-px -translate-y-1/2 rotate-45 bg-black/60" />
    </span>
  )
}

/**
 * One LCD character cell. When its character changes it turns edge-on, swaps the glyph and turns
 * back, staggered left to right like the real 16x2 refreshing. Reduced motion shows it at once.
 */
function LcdCell({ ch, order }: { ch: string; order: number }) {
  const reduced = useReducedMotion()
  const [shown, setShown] = useState(ch)
  const glyph = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = glyph.current
    if (reduced || ch === shown || !el || typeof el.animate !== 'function') return
    const turn = el.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(90deg)' }], {
      duration: 80,
      delay: order * 18,
      easing: 'ease-in',
      fill: 'forwards',
    })
    turn.onfinish = () => {
      setShown(ch)
      turn.cancel()
      el.animate([{ transform: 'rotateX(-90deg)' }, { transform: 'rotateX(0deg)' }], { duration: 110, easing: 'ease-out' })
    }
    return () => {
      turn.onfinish = null
      turn.cancel()
    }
  }, [ch, shown, reduced, order])
  const text = reduced ? ch : shown
  return (
    <span className="flex w-[0.62em] justify-center rounded-[1px] bg-lcd-ink/[0.07] [perspective:400px]">
      <span ref={glyph} className="inline-block">
        {text === ' ' ? NBSP : text}
      </span>
    </span>
  )
}

/** Pads or trims to the LCD's 16 columns. */
function lcdRow(text: string | null | undefined): string[] {
  return [...(text ?? '').slice(0, 16).padEnd(16, ' ')]
}

export interface BeaconReplicaProps {
  /** Latest GET /devices/{id}/display payload, or null when there is none yet. */
  display: Pick<Display, 'code' | 'lcd_line1' | 'lcd_line2' | 'alarm' | 'acknowledged_at'> | null
  /** False when the display poll is failing or too old: the mirror shows NO LINK, as the Uno does after 6 s. */
  linked: boolean
  deviceId?: string
  className?: string
}

/** What the physical beacon on the table is showing right now, large enough to read from the back of the room. */
export function BeaconReplica({ display, linked, deviceId = 'tray-01', className }: BeaconReplicaProps) {
  const live = linked && display !== null
  const code = live ? display.code : 'NO_LINK'
  const alarm = live && display.alarm
  const v = beaconVisual(code, alarm)
  const line1 = live ? display.lcd_line1 : 'NO LINK'
  const line2 = live ? display.lcd_line2 : 'CHECK APP'
  const acked = live && display.code === 'STOP' && display.acknowledged_at
  const reduced = useReducedMotion()
  const backlight = useRef<HTMLDivElement>(null)
  const lastBacklight = useRef(v.backlight)

  // A real backlight flickers when its color switches.
  useEffect(() => {
    if (lastBacklight.current === v.backlight) return
    lastBacklight.current = v.backlight
    const el = backlight.current
    if (reduced || !el || typeof el.animate !== 'function') return
    el.animate([{ filter: 'brightness(1)' }, { filter: 'brightness(0.65)' }, { filter: 'brightness(1.15)' }, { filter: 'brightness(1)' }], { duration: 280 })
  }, [v.backlight, reduced])

  return (
    <figure className={cx('flex flex-col gap-3', className)}>
      <div
        role="img"
        aria-label={`Beacon ${deviceId} shows: ${line1.trim()}, ${line2.trim()}. Red LED ${v.red}, green LED ${v.green}, buzzer ${v.buzzer === 'pulse' ? 'sounding' : 'silent'}.`}
        className="relative rounded-[16px] border border-black bg-gradient-to-b from-[#2b3139] to-[#15181c] px-7 pt-6 pb-6 shadow-[inset_0_1px_0_rgb(255_255_255/0.09),0_22px_44px_rgb(0_0_0/0.55)]"
      >
        <Screw className="top-3 left-3" />
        <Screw className="top-3 right-3" />
        <Screw className="bottom-3 left-3" />
        <Screw className="right-3 bottom-3" />

        <div className="mb-3 flex items-baseline justify-between px-1 text-[0.72rem] tracking-[0.18em] text-faint uppercase">
          <span className="font-display font-semibold">Groundwork site beacon</span>
          <span className="font-display">{deviceId}</span>
        </div>

        <div className="rounded-[6px] bg-black p-3 shadow-[inset_0_2px_6px_rgb(0_0_0/0.9)]">
          <div ref={backlight} className={cx('rounded-[3px] px-3 py-2.5 transition-colors duration-300', BACKLIGHT[v.backlight])}>
            {[lcdRow(line1), lcdRow(line2)].map((row, r) => (
              <div key={r} className="flex justify-between gap-[0.06em] font-lcd text-[2.35rem] leading-[1.08] text-lcd-ink">
                {row.map((ch, c) => (
                  <LcdCell key={c} ch={ch} order={r * 16 + c} />
                ))}
              </div>
            ))}
          </div>
        </div>

        <div className="mt-5 flex items-end justify-between gap-4 px-1">
          <div className="flex gap-6">
            <Led color="red" state={v.red} />
            <Led color="green" state={v.green} />
          </div>
          <div className="flex flex-col items-center gap-2">
            <span className="relative flex size-10 items-center justify-center">
              {v.buzzer === 'pulse' && (
                <>
                  <span aria-hidden className="absolute inset-0 rounded-full border-2 border-stop-glow animate-buzz" />
                  <span aria-hidden className="absolute inset-0 rounded-full border-2 border-stop-glow animate-buzz [animation-delay:300ms]" />
                </>
              )}
              {v.buzzer === 'pulse' ? (
                <BellRing aria-hidden className="size-7 text-stop-glow" />
              ) : (
                <VolumeX aria-hidden className="size-7 text-faint" />
              )}
            </span>
            <span className="text-[0.72rem] text-muted label-caps">buzzer · {v.buzzer === 'pulse' ? 'sounding' : 'silent'}</span>
          </div>
          <div className="hidden flex-col items-end gap-1 text-[0.7rem] text-faint label-caps sm:flex">
            <span className="flex items-center gap-1.5">
              <Hand aria-hidden className="size-3.5" /> touch = acknowledge
            </span>
            <span className="flex items-center gap-1.5">
              <MousePointerClick aria-hidden className="size-3.5" /> hold 2 s = crew flag
            </span>
          </div>
        </div>
      </div>

      <figcaption className="flex flex-wrap items-center justify-between gap-2 px-1 text-[0.8rem] text-muted">
        <span>{LABELS.beaconOutputs}</span>
        {acked && (
          <span className="font-semibold text-caution">Acknowledged {fmtClock(display.acknowledged_at)} · status remains STOP WORK</span>
        )}
      </figcaption>
    </figure>
  )
}
