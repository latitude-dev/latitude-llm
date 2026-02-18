'use client'

import {
  CostBreakdown,
  entryCost,
  ModelCostEntry,
  TokenCostEntry,
  totalCost,
} from '@latitude-data/constants/costs'
import { Skeleton } from '@latitude-data/web-ui/atoms/Skeleton'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TextColor } from '@latitude-data/web-ui/tokens'
import { useMemo } from 'react'

function formatTokenCount(count: number): string {
  if (count < 1_000) return `${count}`
  if (count < 10_000) return `${(count / 1_000).toFixed(1)}K`
  if (count < 1_000_000) return `${Math.round(count / 1_000)}K`
  return `${(count / 1_000_000).toFixed(1)}M`
}

function formatCost(cost: number): string {
  if (cost < 0.01) return '<$0.01'
  const decimals = cost < 0.1 ? 3 : 2
  return `$${cost.toFixed(decimals)}`
}

function hasActivity(entry: TokenCostEntry): boolean {
  return entry.tokens > 0 || (entry.cost !== undefined && entry.cost > 0)
}

function hasModelActivity(entry: ModelCostEntry): boolean {
  return (
    hasActivity(entry.input.prompt) ||
    hasActivity(entry.input.cached) ||
    hasActivity(entry.output.reasoning) ||
    hasActivity(entry.output.completion)
  )
}

type CostBreakdownDisplayProps = {
  breakdown: CostBreakdown
  color?: TextColor
}

type CostCategory = 'prompt' | 'cached' | 'reasoning' | 'completion'

const CATEGORY_COLORS: Record<CostCategory, string> = {
  prompt: '#3b82f6',
  cached: '#93c5fd',
  reasoning: '#22c55e',
  completion: '#86efac',
}

function CostRow({
  label,
  entry,
  color,
}: {
  label: CostCategory
  entry: TokenCostEntry
  color: TextColor
}) {
  return (
    <div className='flex flex-row items-center justify-between gap-4'>
      <div className='flex flex-row items-center gap-2'>
        <div
          className='w-2 h-2 rounded-sm'
          style={{ backgroundColor: CATEGORY_COLORS[label] }}
        />
        <Text.H6 color={color}>{label}</Text.H6>
      </div>
      <div className='flex flex-row items-center gap-3'>
        <Text.H6 color={color}>{formatTokenCount(entry.tokens)} tok</Text.H6>
        {entry.cost !== undefined && (
          <Text.H6 color={color}>{formatCost(entry.cost)}</Text.H6>
        )}
      </div>
    </div>
  )
}

function ModelEntryCostBar({ entry }: { entry: ModelCostEntry }) {
  const total = useMemo(() => entryCost(entry), [entry])

  if (total <= 0) return null

  type Segment = { key: CostCategory; color: string; cost: number }
  const allSegments: Segment[] = [
    {
      key: 'prompt',
      color: CATEGORY_COLORS.prompt,
      cost: entry.input.prompt.cost ?? 0,
    },
    {
      key: 'cached',
      color: CATEGORY_COLORS.cached,
      cost: entry.input.cached.cost ?? 0,
    },
    {
      key: 'reasoning',
      color: CATEGORY_COLORS.reasoning,
      cost: entry.output.reasoning.cost ?? 0,
    },
    {
      key: 'completion',
      color: CATEGORY_COLORS.completion,
      cost: entry.output.completion.cost ?? 0,
    },
  ]
  const segments = allSegments.filter((s) => s.cost > 0)

  return (
    <div className='flex flex-row w-full rounded-lg overflow-hidden h-2'>
      {segments.map(({ key, color, cost }) => (
        <div
          key={key}
          className='h-full'
          style={{ width: `${(cost / total) * 100}%`, backgroundColor: color }}
        />
      ))}
    </div>
  )
}

function TokenRows({
  entry,
  color,
}: {
  entry: ModelCostEntry
  color: TextColor
}) {
  return (
    <>
      {hasActivity(entry.input.prompt) && (
        <CostRow label='prompt' entry={entry.input.prompt} color={color} />
      )}
      {hasActivity(entry.input.cached) && (
        <CostRow label='cached' entry={entry.input.cached} color={color} />
      )}
      {hasActivity(entry.output.reasoning) && (
        <CostRow
          label='reasoning'
          entry={entry.output.reasoning}
          color={color}
        />
      )}
      {hasActivity(entry.output.completion) && (
        <CostRow
          label='completion'
          entry={entry.output.completion}
          color={color}
        />
      )}
    </>
  )
}

function ModelCostBreakdown({
  model,
  entry,
  color,
}: {
  model: string
  entry: ModelCostEntry
  color: TextColor
}) {
  return (
    <div className='flex flex-col gap-y-1'>
      <Text.H6B color={color}>{model}</Text.H6B>
      <div className='pl-2 flex flex-col gap-y-2'>
        <TokenRows entry={entry} color={color} />
        <ModelEntryCostBar entry={entry} />
      </div>
    </div>
  )
}

export function CostBreakdownDisplay({
  breakdown,
  color = 'foregroundMuted',
}: CostBreakdownDisplayProps) {
  const entries = Object.entries(breakdown).filter(([_, entry]) =>
    hasModelActivity(entry),
  )

  if (entries.length === 0) return null

  const total = totalCost(breakdown)

  return (
    <div className='flex flex-col gap-y-3'>
      {entries.map(([model, entry]) => (
        <ModelCostBreakdown
          key={model}
          model={model}
          entry={entry}
          color={color}
        />
      ))}
      <div className='border-t border-current opacity-20' />
      <div className='flex flex-row justify-end'>
        <Text.H6B color={color}>{formatCost(total)}</Text.H6B>
      </div>
    </div>
  )
}

export function CostBreakdownSkeleton() {
  return (
    <div className='flex flex-col gap-y-3'>
      <div className='flex flex-row justify-end'>
        <Text.H6B color='foregroundMuted'>
          <Skeleton className='w-16 h-4' />
        </Text.H6B>
      </div>
      <Skeleton className='w-full h-4' />
      <Skeleton className='w-full h-4' />
      <Skeleton className='w-full h-4' />
    </div>
  )
}
