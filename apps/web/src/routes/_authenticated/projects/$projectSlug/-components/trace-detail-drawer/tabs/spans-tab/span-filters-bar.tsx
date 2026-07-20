import { cn, Icon, Select, type SelectOption, Text } from "@repo/ui"
import { formatCount } from "@repo/utils"
import { AlertTriangleIcon, DatabaseIcon, WrenchIcon, XIcon } from "lucide-react"
import type { ReactNode } from "react"
import type { SpanRecord } from "../../../../../../../../domains/spans/spans.functions.ts"
import { collectSpanModels, countMatchingSpans, hasActiveSpanFilters, type SpanFilters } from "./span-filters.ts"

type SpanFiltersBarProps = {
  readonly spans: readonly SpanRecord[]
  readonly filters: SpanFilters
  readonly onToggleErrors: () => void
  readonly onToggleTools: () => void
  readonly onToggleMemory: () => void
  readonly onSelectModel: (model: string) => void
  readonly onClearFilters: () => void
}

const filterButtonClass =
  "inline-flex h-7 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
const ALL_MODELS_VALUE = "__all_models__"

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
  onToggleMemory,
  onSelectModel,
  onClearFilters,
}: SpanFiltersBarProps) {
  const models = collectSpanModels(spans)
  const modelOptions: SelectOption<string>[] = [
    { label: "All models", value: ALL_MODELS_VALUE },
    ...models.map((model) => ({ label: model, value: model })),
  ]
  const matchingCount = countMatchingSpans(spans, filters)
  const filtersActive = hasActiveSpanFilters(filters)

  return (
    <div className="flex shrink-0 border-b border-border px-4 py-3">
      <div className="flex w-full flex-row flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 flex-row flex-wrap items-center gap-2">
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
            <Icon icon={WrenchIcon} size="xs" color={filters.tools ? "accentForeground" : "foregroundMuted"} />
            <span>Tools</span>
          </FilterToggle>

          <FilterToggle
            active={filters.memory}
            activeClassName="border-warning-muted-foreground/30 bg-warning-muted text-warning-muted-foreground"
            inactiveClassName="border-border bg-secondary text-muted-foreground hover:bg-muted"
            onClick={onToggleMemory}
            ariaLabel={filters.memory ? "Show all spans" : "Show only memory spans"}
          >
            <Icon icon={DatabaseIcon} size="xs" color={filters.memory ? "warningMutedForeground" : "foregroundMuted"} />
            <span>Memory</span>
          </FilterToggle>

          {models.length > 0 ? (
            <Select
              name="span-model-filter"
              options={modelOptions}
              value={filters.model || ALL_MODELS_VALUE}
              onChange={(nextModel) => onSelectModel(nextModel === ALL_MODELS_VALUE ? "" : nextModel)}
              width="auto"
              contentWidth="trigger"
              size="small"
              triggerClassName={cn("w-32 shadow-none", {
                "border-primary/30 bg-primary/10": !!filters.model,
                "border-border bg-secondary hover:bg-muted": !filters.model,
              })}
            />
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
          <Text.H6 color="foregroundMuted" noWrap className="px-1">
            {formatCount(matchingCount)} of {formatCount(spans.length)} matching spans
          </Text.H6>
        ) : null}
      </div>
    </div>
  )
}
