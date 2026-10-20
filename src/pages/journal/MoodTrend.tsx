// 30-day mood line. Single series (the card title names it, so no legend);
// days without a mood are gaps, not interpolated.
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { fmt } from '@/lib/dates'
import { MOOD_EMOJI, MOOD_LABELS } from '@/lib/defaults'
import type { Mood } from '@/lib/types'
import type { MoodPoint } from './insights'

const AXIS_TICK = { fill: 'var(--chart-axis)', fontSize: 11 }

export function MoodTrend({ points }: { points: MoodPoint[] }) {
  // Five evenly spaced date ticks, always including the first and last day.
  const last = points.length - 1
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => points[Math.round(last * f)]?.date).filter((d): d is string => !!d)
  const logged = points.filter((p) => p.mood != null).length

  return (
    <div
      className="h-44 w-full"
      role="img"
      aria-label={`Mood over the last ${points.length} days, ${logged} days logged.`}
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis
            dataKey="date"
            ticks={ticks}
            interval={0}
            tickFormatter={(d: string) => fmt(d, 'MMM d')}
            tick={AXIS_TICK}
            tickLine={false}
            axisLine={false}
            tickMargin={8}
            padding={{ left: 8, right: 8 }}
          />
          <YAxis
            domain={[1, 5]}
            ticks={[1, 2, 3, 4, 5]}
            allowDecimals={false}
            tickFormatter={(v: number) => MOOD_EMOJI[v as Mood] ?? ''}
            tick={{ ...AXIS_TICK, fontSize: 13 }}
            tickLine={false}
            axisLine={false}
            width={36}
          />
          <Tooltip
            cursor={{ stroke: 'var(--border-strong)', strokeWidth: 1 }}
            isAnimationActive={false}
            content={({ active, payload }) => {
              const p = payload?.[0]?.payload as MoodPoint | undefined
              if (!active || !p) return null
              const mood = p.mood as Mood | null
              return (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-pop">
                  <p className="text-muted">{fmt(p.date, 'EEE, MMM d')}</p>
                  <p className="mt-0.5 font-medium text-ink">
                    {mood ? `${MOOD_EMOJI[mood]} ${MOOD_LABELS[mood]}` : 'No mood logged'}
                  </p>
                </div>
              )
            }}
          />
          <Line
            type="monotone"
            dataKey="mood"
            connectNulls={false}
            stroke="var(--accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            dot={{ r: 4, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
            activeDot={{ r: 6, fill: 'var(--accent)', stroke: 'var(--surface)', strokeWidth: 2 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
