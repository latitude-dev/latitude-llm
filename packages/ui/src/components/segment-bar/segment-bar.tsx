export interface SegmentBarItem {
  readonly label: string
  readonly value: number
  readonly color: string
}

export function SegmentBar({ segments }: { readonly segments: readonly SegmentBarItem[] }) {
  const visible = segments.filter((s) => s.value > 0)
  const total = visible.reduce((sum, s) => sum + s.value, 0)
  if (total <= 0) return null

  return (
    <div className="flex flex-row w-full rounded overflow-hidden h-2">
      {visible.map((s) => (
        <div
          key={s.label}
          className="h-full min-w-1"
          style={{ width: `${(s.value / total) * 100}%`, backgroundColor: s.color }}
        />
      ))}
    </div>
  )
}
