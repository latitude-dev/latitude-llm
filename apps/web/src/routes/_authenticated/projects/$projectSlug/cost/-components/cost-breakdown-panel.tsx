import { COST_BREAKDOWN_DIMENSIONS, type CostBreakdown, type CostBreakdownDimension } from "@domain/spans"
import {
  Button,
  Icon,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Tabs,
  Text,
  Tooltip,
} from "@repo/ui"
import { formatCount, formatPercentage } from "@repo/utils"
import { TriangleAlertIcon } from "lucide-react"
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

const DASH = "—"

// The tail is long and uninformative: on real data most values below this are a single
// trace at 0% of spend. They stay reachable behind the show-all control.
const BREAKDOWN_ROWS_SHOWN = 8

const DIMENSION_META: Record<
  CostBreakdownDimension,
  { readonly label: string; readonly unknown: string; readonly plural: string }
> = {
  model: { label: "Model", unknown: "unknown model", plural: "models" },
  provider: { label: "Provider", unknown: "unknown provider", plural: "providers" },
  operation: { label: "Operation", unknown: "unknown operation", plural: "operations" },
  service: { label: "Service", unknown: "unattributed", plural: "services" },
}

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
  const meta = DIMENSION_META[dimension]
  const { totals } = breakdown
  const { visible, remainder } = splitBreakdownRows({
    breakdown,
    limit: showAll ? breakdown.rows.length : BREAKDOWN_ROWS_SHOWN,
  })
  const hidden = totals.distinctValues - visible.length

  const remainderLabel = (count: number): string =>
    count === 1 ? `Other (1 ${meta.plural.replace(/s$/, "")})` : `Other (${formatCount(count)} ${meta.plural})`

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>{meta.label}</TableHead>
            <TableHead align="right">Total cost</TableHead>
            <TableHead align="right">% of total</TableHead>
            <TableHead
              align="right"
              tooltipMessage={`Spend divided by the traces containing this ${meta.label.toLowerCase()}, not by every trace in the window — a trace can hit several.`}
            >
              Avg per trace
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {visible.map((row) => (
            <TableRow key={row.key || meta.unknown}>
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
              label={remainderLabel(remainder.valueCount)}
              totalMicrocents={totals.totalMicrocents}
            />
          ) : null}
          <TableRow hoverable={false} borderBottom={false} className="bg-secondary">
            <TableCell>
              <Text.H5 color="foregroundMuted" noWrap>
                {`All ${meta.plural}`}
              </Text.H5>
            </TableCell>
            <TableCell align="right">
              <TotalCostCell
                totalMicrocents={totals.totalMicrocents}
                unpricedCalls={totals.unpricedCalls + totals.unknownCalls}
                unpricedTokens={totals.unpricedTokens + totals.unknownTokens}
                tokens={totals.tokens}
                muted
              />
            </TableCell>
            <TableCell align="right">
              <MutedCell>{totals.totalMicrocents > 0 ? formatPercentage(1) : DASH}</MutedCell>
            </TableCell>
            <TableCell align="right">
              <div className="flex flex-col items-end">
                <MutedCell>
                  {usd(totals.tracesWithUsage > 0 ? totals.totalMicrocents / totals.tracesWithUsage : 0)}
                </MutedCell>
                <Text.H6 color="foregroundMuted" noWrap>
                  {`${formatCount(totals.tracesWithUsage)} traces`}
                </Text.H6>
              </div>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {hidden > 0 || showAll ? (
        <div className="flex flex-row items-center gap-2">
          <Button variant="link" size="sm" onClick={() => setShowAll(!showAll)}>
            {showAll ? `Show top ${BREAKDOWN_ROWS_SHOWN}` : `Show all ${formatCount(breakdown.rows.length)}`}
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
}: {
  readonly remainder: BreakdownRemainder
  readonly label: string
  readonly totalMicrocents: number
}) {
  return (
    <TableRow>
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

/** The detail table: exact figures per value. Proportions live in the panel above it. */
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
    <div className="flex flex-col gap-3">
      <div className="flex flex-row flex-wrap items-center justify-between gap-2">
        <Text.H5 color="foreground">Cost breakdown</Text.H5>
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
        <TableSkeleton rows={5} cols={4} />
      ) : breakdown.rows.length === 0 ? (
        <div className="flex w-full min-h-[120px] items-center justify-center rounded-lg bg-secondary px-4 py-3">
          <Text.H6 color="foregroundMuted">{`No billable usage by ${meta.plural} in this time window`}</Text.H6>
        </div>
      ) : (
        <BreakdownTable key={dimension} breakdown={breakdown} dimension={dimension} />
      )}
    </div>
  )
}
