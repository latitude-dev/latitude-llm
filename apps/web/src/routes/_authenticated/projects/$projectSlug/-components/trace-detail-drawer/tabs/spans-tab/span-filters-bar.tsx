import { Badge, cn, Icon, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { AlertTriangleIcon, WrenchIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { SpanRecord } from "../../../../../../../../domains/spans/spans.functions.ts"
import { collectSpanModels, countMatchingSpans, hasActiveSpanFilters, type SpanFilters } from "./span-filters.ts"

type SpanFiltersBarProps = {
  readonly spans: readonly SpanRecord[]
  readonly filters: SpanFilters
  readonly onToggleErrors: () => void
  readonly onToggleTools: () => void
  readonly onSelectModel: (model: string) => void
  readonly onClearFilters: () => void
}

const filterButtonClass =
  "inline-flex h-7 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"

function FilterToggle({
  active,
  activeClassName,
  inactiveClassName,
  onClick,
  children,
  ariaLabel,
}: {
  readonly active: boolean
  readonly activeClassName: string
  readonly inactiveClassName: string
  readonly onClick: () => void
  readonly children: ReactNode
  readonly ariaLabel: string
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-label={ariaLabel}
      onClick={onClick}
      className={cn(filterButtonClass, active ? activeClassName : inactiveClassName)}
    >
      {children}
    </button>
  )
}

export function SpanFiltersBar({
  spans,
  filters,
  onToggleErrors,
  onToggleTools,
  onSelectModel,
  onClearFilters,
}: SpanFiltersBarProps) {
  const models = collectSpanModels(spans)
  const matchingCount = countMatchingSpans(spans, filters)
  const filtersActive = hasActiveSpanFilters(filters)

  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-border px-4 py-3">
      <div className="flex flex-row flex-wrap items-center gap-2">
        <FilterToggle
          active={filters.errors}
          activeClassName="border-destructive-muted-foreground/30 bg-destructive-muted text-destructive-muted-foreground"
          inactiveClassName="border-border bg-secondary text-muted-foreground hover:bg-muted"
          onClick={onToggleErrors}
          ariaLabel={filters.errors ? "Show all spans" : "Show only errored spans"}
        >
          <Icon icon={AlertTriangleIcon} size="xs" color={filters.errors ? "destructive" : "foregroundMuted"} />
          <span>Errors</span>
        </FilterToggle>

        <FilterToggle
          active={filters.tools}
          activeClassName="border-accent-foreground/30 bg-accent text-accent-foreground"
          inactiveClassName="border-border bg-secondary text-muted-foreground hover:bg-muted"
          onClick={onToggleTools}
          ariaLabel={filters.tools ? "Show all spans" : "Show only tool spans"}
        >
          <Icon icon={WrenchIcon} size="xs" color={filters.tools ? "accent" : "foregroundMuted"} />
          <span>Tools</span>
        </FilterToggle>

        {models.length > 0 ? (
          <>
            <div className="hidden h-4 w-px shrink-0 bg-border sm:block" aria-hidden />
            {models.map((model) => {
              const active = filters.model === model
              return (
                <button
                  key={model}
                  type="button"
                  aria-pressed={active}
                  aria-label={active ? `Clear model filter for ${model}` : `Show only ${model} spans`}
                  onClick={() => onSelectModel(model)}
                  className={cn(filterButtonClass, {
                    "border-primary/30 bg-primary/10 text-foreground": active,
                    "border-border bg-secondary text-muted-foreground hover:bg-muted": !active,
                  })}
                >
                  <span className="max-w-[12rem] truncate">{model}</span>
                </button>
              )
            })}
          </>
        ) : null}

        {filtersActive ? (
          <button
            type="button"
            onClick={onClearFilters}
            aria-label="Clear span filters"
            className={cn(
              filterButtonClass,
              "border-transparent bg-transparent text-muted-foreground hover:bg-muted hover:text-foreground",
            )}
          >
            <Icon icon={XIcon} size="xs" color="foregroundMuted" />
            <span>Clear</span>
          </button>
        ) : null}
      </div>

      {filtersActive ? (
        <div className="flex flex-row items-center gap-2">
          <Badge variant="outlineMuted" size="small" shape="rounded" noWrap>
            {formatCount(matchingCount)} of {formatCount(spans.length)}
          </Badge>
          <Text.H6 color="foregroundMuted">matching spans</Text.H6>
        </div>
      ) : null}
    </div>
  )
}
