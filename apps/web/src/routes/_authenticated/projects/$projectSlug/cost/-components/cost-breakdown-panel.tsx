import { COST_BREAKDOWN_DIMENSIONS, type CostBreakdown, type CostBreakdownDimension } from "@domain/spans"
import {
  Button,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHeader,
  TableRow,
  TableSkeleton,
  Tabs,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { PieChartIcon, TriangleAlertIcon } from "lucide-react"
import { useState } from "react"
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  type BreakdownRemainder,
  formatSignedPrice,
  isCostBreakdownDimension,
  microcentsToUsd,
  shareOf,
  splitBreakdownRows,
} from "./cost-formatters.ts"
import { CostTableHead, HeaderSummary } from "./cost-table-head.tsx"
import { EmptyState } from "./empty-state.tsx"

const DASH = "—"

// The tail is long and uninformative: on real data most values below this are a single
// trace at 0% of spend. They stay reachable behind the show-all control.
const BREAKDOWN_ROWS_SHOWN = 8

const DIMENSION_META: Record<
  CostBreakdownDimension,
  { readonly label: string; readonly unknown: string; readonly plural: string; readonly singular: string }
> = {
  model: { label: "Model", unknown: "unknown model", plural: "models", singular: "model" },
  provider: { label: "Provider", unknown: "unknown provider", plural: "providers", singular: "provider" },
  operation: { label: "Operation", unknown: "unknown operation", plural: "operations", singular: "operation" },
  service: { label: "Service", unknown: "unattributed", plural: "services", singular: "service" },
}

const SORT_COLUMNS = ["name", "total", "input", "output", "cacheAndOther", "share", "avgPerTrace"] as const
type SortColumn = (typeof SORT_COLUMNS)[number]

const usd = (microcents: number): string => formatSignedPrice(microcentsToUsd(microcents))

function MutedCell({ children }: { readonly children: string }) {
  return (
    <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
      {children}
    </Text.H5>
  )
}

/**
 * A row's total plus what it leaves out. `rollupCostDisplay` already owns the money
 * vocabulary; the icon exists because the note it produces would otherwise only
 * live in a tooltip, and an understated total is the row's most important caveat.
 */
function TotalCostCell({
  totalMicrocents,
  unpricedCalls,
  unpricedTokens,
  tokens,
  muted = false,
}: {
  readonly totalMicrocents: number
  readonly unpricedCalls: number
  readonly unpricedTokens: number
  readonly tokens: number
  readonly muted?: boolean
}) {
  const display = rollupCostDisplay({
    costTotalMicrocents: totalMicrocents,
    unpricedSpanCount: unpricedCalls,
    tokensTotal: tokens,
  })
  const amount = (
    <Text.H5 color={muted ? "foregroundMuted" : "foreground"} noWrap className="tabular-nums">
      {display.label}
    </Text.H5>
  )
  if (unpricedCalls <= 0)
    return display.note ? (
      <Tooltip asChild trigger={amount}>
        {display.note}
      </Tooltip>
    ) : (
      amount
    )

  return (
    <Tooltip
      asChild
      trigger={
        <span className="inline-flex cursor-default flex-row items-center gap-1">
          <Icon icon={TriangleAlertIcon} size="sm" color="warningMutedForeground" />
          {amount}
        </span>
      }
    >
      {`${formatCount(unpricedTokens)} tokens on ${formatCount(unpricedCalls)} calls recorded no cost, so this total is understated.`}
    </Tooltip>
  )
}

function BreakdownTable({
  breakdown,
  dimension,
}: {
  readonly breakdown: CostBreakdown
  readonly dimension: CostBreakdownDimension
}) {
  const [showAll, setShowAll] = useState(false)
  const [sort, setSort] = useState<{ column: SortColumn; direction: "asc" | "desc" }>({
    column: "total",
    direction: "desc",
  })
  const meta = DIMENSION_META[dimension]
  const { totals } = breakdown
  const { visible, remainder } = splitBreakdownRows({
    breakdown,
    limit: showAll ? breakdown.rows.length : BREAKDOWN_ROWS_SHOWN,
  })
  const hidden = totals.distinctValues - visible.length

  // Rendered only when it carries something. When every row reads $0 the two named
  // sides already sum to the total, so dropping it cannot hide a non-closing row.
  const showCacheColumn =
    totals.cacheAndOtherMicrocents !== 0 ||
    (remainder?.cacheAndOtherMicrocents ?? 0) !== 0 ||
    visible.some((row) => row.cacheAndOtherMicrocents !== 0)

  const sorted = [...visible].sort((a, b) => {
    const ascending = sort.direction === "asc" ? 1 : -1
    if (sort.column === "name") return (a.key || meta.unknown).localeCompare(b.key || meta.unknown) * ascending
    const measure = {
      total: (r: typeof a) => r.totalMicrocents,
      share: (r: typeof a) => r.totalMicrocents,
      input: (r: typeof a) => r.inputMicrocents,
      output: (r: typeof a) => r.outputMicrocents,
      cacheAndOther: (r: typeof a) => r.cacheAndOtherMicrocents,
      avgPerTrace: (r: typeof a) => r.avgPerTraceMicrocents,
    }[sort.column]
    return (measure(a) - measure(b)) * ascending
  })

  const onSort = (column: SortColumn) =>
    setSort((current) =>
      current.column === column
        ? { column, direction: current.direction === "desc" ? "asc" : "desc" }
        : // Names read naturally A-Z; every measure is most useful largest first.
          { column, direction: column === "name" ? "asc" : "desc" },
    )

  // `h-auto` clears the shared header cell's fixed 40px so the sum line underneath the
  // label has room; `py-3` is the breathing room before the first body row that was missing.
  const headProps = { sort, onSort, className: "h-auto py-3" } as const

  return (
    <div className="flex flex-col gap-2">
      <Table wrapperClassName="border-0 rounded-none">
        <TableHeader className="[&_tr]:border-b-0">
          <TableRow hoverable={false}>
            <CostTableHead column="name" label={meta.label} align="left" isFirst alphabetical {...headProps} />
            <CostTableHead
              column="total"
              label="Total cost"
              align="right"
              isFirst={false}
              summary={<HeaderSummary kind="SUM" value={usd(totals.totalMicrocents)} />}
              {...headProps}
            />
            <CostTableHead
              column="input"
              label="Input"
              align="right"
              isFirst={false}
              summary={<HeaderSummary kind="SUM" value={usd(totals.inputMicrocents)} />}
              {...headProps}
            />
            <CostTableHead
              column="output"
              label="Output"
              align="right"
              isFirst={false}
              summary={<HeaderSummary kind="SUM" value={usd(totals.outputMicrocents)} />}
              {...headProps}
            />
            {showCacheColumn ? (
              <CostTableHead
                column="cacheAndOther"
                label="Cache & other"
                align="right"
                isFirst={false}
                tooltipMessage="Total minus input and output. Provider-reported cost folds cache reads and writes into the input side, and some providers return a total that is not the sum of the two, so this column is what closes each row."
                summary={<HeaderSummary kind="SUM" value={usd(totals.cacheAndOtherMicrocents)} />}
                {...headProps}
              />
            ) : null}
            <CostTableHead column="share" label="% of total" align="right" isFirst={false} {...headProps} />
            <CostTableHead
              column="avgPerTrace"
              label="Avg per trace"
              align="right"
              isFirst={false}
              tooltipMessage={`Spend divided by the traces containing this ${meta.singular}, not by every trace in the window — a trace can hit several.`}
              summary={
                <HeaderSummary
                  kind="AVG"
                  value={usd(totals.tracesWithUsage > 0 ? totals.totalMicrocents / totals.tracesWithUsage : 0)}
                />
              }
              {...headProps}
            />
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((row) => (
            <TableRow key={row.key || meta.unknown} className="border-background bg-secondary/40">
              <TableCell>
                <Text.H5 color="foreground" ellipsis noWrap>
                  {row.key || meta.unknown}
                </Text.H5>
              </TableCell>
              <TableCell align="right">
                <TotalCostCell
                  totalMicrocents={row.totalMicrocents}
                  unpricedCalls={row.unpricedCalls + row.unknownCalls}
                  unpricedTokens={row.unpricedTokens + row.unknownTokens}
                  tokens={row.tokens}
                />
              </TableCell>
              <TableCell align="right">
                <MutedCell>{usd(row.inputMicrocents)}</MutedCell>
              </TableCell>
              <TableCell align="right">
                <MutedCell>{usd(row.outputMicrocents)}</MutedCell>
              </TableCell>
              {showCacheColumn ? (
                <TableCell align="right">
                  <MutedCell>{usd(row.cacheAndOtherMicrocents)}</MutedCell>
                </TableCell>
              ) : null}
              <TableCell align="right">
                <Text.H5 color="foreground" noWrap className="tabular-nums">
                  {formatPercentage(shareOf(row.totalMicrocents, totals.totalMicrocents) ?? 0)}
                </Text.H5>
              </TableCell>
              <TableCell align="right">
                <div className="flex flex-col items-end">
                  <Text.H5 color="foreground" noWrap className="tabular-nums">
                    {usd(row.avgPerTraceMicrocents)}
                  </Text.H5>
                  <Text.H6 color="foregroundMuted" noWrap>
                    {`${formatCount(row.tracesWithValue)} traces`}
                  </Text.H6>
                </div>
              </TableCell>
            </TableRow>
          ))}
          {remainder ? (
            <RemainderRow
              remainder={remainder}
              label={
                remainder.valueCount === 1
                  ? `Other (1 ${meta.singular})`
                  : `Other (${formatCount(remainder.valueCount)} ${meta.plural})`
              }
              totalMicrocents={totals.totalMicrocents}
              showCacheColumn={showCacheColumn}
            />
          ) : null}
        </TableBody>
      </Table>
      {breakdown.rows.length > BREAKDOWN_ROWS_SHOWN ? (
        <div className="flex flex-row items-center justify-center gap-2">
          <Button variant="link" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? "Show less" : `Show all ${formatCount(breakdown.rows.length)}`}
          </Button>
          {showAll && hidden > 0 ? (
            <Text.H6 color="foregroundMuted">
              {`${formatCount(hidden)} beyond the ${formatCount(breakdown.rows.length)} highest-spending ${meta.plural} stay grouped as Other.`}
            </Text.H6>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

/** The tail as one row. Only the columns that sum appear; a per-trace average over a bag of values does not. */
function RemainderRow({
  remainder,
  label,
  totalMicrocents,
  showCacheColumn,
}: {
  readonly remainder: BreakdownRemainder
  readonly label: string
  readonly totalMicrocents: number
  readonly showCacheColumn: boolean
}) {
  return (
    <TableRow className="border-background bg-secondary/40">
      <TableCell>
        <Text.H5 color="foregroundMuted" ellipsis noWrap>
          {label}
        </Text.H5>
      </TableCell>
      <TableCell align="right">
        <TotalCostCell
          totalMicrocents={remainder.totalMicrocents}
          unpricedCalls={remainder.unpricedCalls + remainder.unknownCalls}
          unpricedTokens={remainder.unpricedTokens + remainder.unknownTokens}
          tokens={remainder.tokens}
          muted
        />
      </TableCell>
      <TableCell align="right">
        <MutedCell>{usd(remainder.inputMicrocents)}</MutedCell>
      </TableCell>
      <TableCell align="right">
        <MutedCell>{usd(remainder.outputMicrocents)}</MutedCell>
      </TableCell>
      {showCacheColumn ? (
        <TableCell align="right">
          <MutedCell>{usd(remainder.cacheAndOtherMicrocents)}</MutedCell>
        </TableCell>
      ) : null}
      <TableCell align="right">
        <MutedCell>{formatPercentage(shareOf(remainder.totalMicrocents, totalMicrocents) ?? 0)}</MutedCell>
      </TableCell>
      <TableCell align="right">
        <Tooltip
          asChild
          trigger={
            <span className="inline-flex cursor-default">
              <MutedCell>{DASH}</MutedCell>
            </span>
          }
        >
          A trace can hit several values, so trace counts do not sum and this group has no per-trace average.
        </Tooltip>
      </TableCell>
    </TableRow>
  )
}

/** The detail table: exact figures per value. Proportions live in the panels above it. */
/**
 * Sorting only reorders the rows already selected. The selection is always the highest
 * spenders, so sorting ascending cannot smuggle the uninformative tail into view.
 */
export function CostBreakdownPanel({
  breakdown,
  dimension,
  onDimensionChange,
  isLoading,
}: {
  readonly breakdown: CostBreakdown | undefined
  readonly dimension: CostBreakdownDimension
  readonly onDimensionChange: (dimension: CostBreakdownDimension) => void
  readonly isLoading: boolean
}) {
  const meta = DIMENSION_META[dimension]

  return (
    // The row separators are painted in `--background`, so the card must actually carry it.
    <div className="flex flex-col gap-3 rounded-lg bg-background p-3">
      <div className="flex min-h-8 flex-row flex-wrap items-center justify-between gap-2">
        <Text.H6 color="foregroundMuted">Cost breakdown</Text.H6>
        <Tabs
          variant="bordered"
          size="sm"
          className="border-none bg-muted"
          indicatorClassName="border-none"
          options={COST_BREAKDOWN_DIMENSIONS.map((value) => ({
            id: value,
            label: DIMENSION_META[value].label,
          }))}
          active={dimension}
          onSelect={(value) => {
            if (isCostBreakdownDimension(value)) onDimensionChange(value)
          }}
        />
      </div>
      {isLoading || !breakdown ? (
        <TableSkeleton rows={5} cols={6} />
      ) : breakdown.rows.length === 0 ? (
        <EmptyState icon={PieChartIcon} message={`No billable usage by ${meta.plural} in this time window`} />
      ) : (
        <BreakdownTable key={dimension} breakdown={breakdown} dimension={dimension} />
      )}
    </div>
  )
}
