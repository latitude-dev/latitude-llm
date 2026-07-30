import { COST_BREAKDOWN_DIMENSIONS, type CostBreakdown, type CostBreakdownDimension } from "@domain/spans"
import {
  Badge,
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
import { rollupCostDisplay } from "../../../../../../domains/spans/cost-display.ts"
import {
  costPerCallMultiple,
  formatCostMultiple,
  formatSignedPrice,
  isCostBreakdownDimension,
  microcentsToUsd,
  shareOf,
} from "./cost-formatters.ts"
import { OTHER_SERIES_COLOR, TREND_COLOR } from "./cost-series-colors.ts"

const DASH = "—"

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

/** The mock's ████ bars: a share is easier to rank by length than to read as a number. */
function ShareCell({ share, color }: { readonly share: number | null; readonly color: string }) {
  if (share === null) {
    return (
      <Text.H5 color="foregroundMuted" noWrap>
        {DASH}
      </Text.H5>
    )
  }
  return (
    <div className="flex w-full min-w-24 flex-row items-center gap-2">
      <div className="flex h-1.5 w-full min-w-10 overflow-hidden rounded-sm bg-muted">
        <div
          className="h-full"
          style={{ width: `${Math.max(0, Math.min(100, share * 100))}%`, backgroundColor: color }}
        />
      </div>
      <Text.H5 color="foreground" noWrap className="tabular-nums">
        {formatPercentage(share)}
      </Text.H5>
    </div>
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
}: {
  readonly totalMicrocents: number
  readonly unpricedCalls: number
  readonly unpricedTokens: number
  readonly tokens: number
}) {
  const display = rollupCostDisplay({
    costTotalMicrocents: totalMicrocents,
    unpricedSpanCount: unpricedCalls,
    tokensTotal: tokens,
  })
  const amount = (
    <Text.H5 color="foreground" noWrap className="tabular-nums">
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
  const meta = DIMENSION_META[dimension]
  const { totals } = breakdown
  const truncated = totals.distinctValues - breakdown.rows.length

  return (
    <div className="flex flex-col gap-2">
      <Table>
        <TableHeader>
          <TableRow hoverable={false}>
            <TableHead>{meta.label}</TableHead>
            <TableHead align="right">Total cost</TableHead>
            <TableHead align="right">Input</TableHead>
            <TableHead align="right">Output</TableHead>
            <TableHead
              align="right"
              tooltipMessage="Total minus input and output. Provider-reported cost folds cache reads and writes into the input side, and some providers return a total that is not the sum of the two, so this column is what closes each row."
            >
              Cache & other
            </TableHead>
            <TableHead align="right">% of total</TableHead>
            <TableHead
              align="right"
              tooltipMessage={`Spend divided by the traces containing this ${meta.label.toLowerCase()}, not by every trace in the window — a trace can hit several.`}
            >
              Avg per trace
            </TableHead>
            <TableHead align="right">Share of calls</TableHead>
            <TableHead
              align="right"
              tooltipMessage="Cost of one call here against the window's average call. Above 1× means this row eats a share of the money out of proportion to how much it is used."
            >
              $/call
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {breakdown.rows.map((row) => {
            const multiple = costPerCallMultiple({
              totalMicrocents: row.totalMicrocents,
              calls: row.calls,
              avgPerCallMicrocents: totals.avgPerCallMicrocents,
            })
            return (
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
                  <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                    {usd(row.inputMicrocents)}
                  </Text.H5>
                </TableCell>
                <TableCell align="right">
                  <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                    {usd(row.outputMicrocents)}
                  </Text.H5>
                </TableCell>
                <TableCell align="right">
                  <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                    {usd(row.cacheAndOtherMicrocents)}
                  </Text.H5>
                </TableCell>
                <TableCell align="right">
                  <ShareCell share={shareOf(row.totalMicrocents, totals.totalMicrocents)} color={TREND_COLOR} />
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
                <TableCell align="right">
                  <ShareCell share={shareOf(row.calls, totals.calls)} color={OTHER_SERIES_COLOR} />
                </TableCell>
                <TableCell align="right">
                  <div className="flex flex-row items-center justify-end gap-2">
                    <Text.H5 color="foreground" noWrap className="tabular-nums">
                      {row.calls > 0 ? usd(row.totalMicrocents / row.calls) : DASH}
                    </Text.H5>
                    {multiple === null ? null : (
                      <Badge variant={multiple >= 2 ? "warningMuted" : "muted"} size="small">
                        {`${formatCostMultiple(multiple)} avg`}
                      </Badge>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            )
          })}
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
              />
            </TableCell>
            <TableCell align="right">
              <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                {usd(totals.inputMicrocents)}
              </Text.H5>
            </TableCell>
            <TableCell align="right">
              <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                {usd(totals.outputMicrocents)}
              </Text.H5>
            </TableCell>
            <TableCell align="right">
              <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                {usd(totals.cacheAndOtherMicrocents)}
              </Text.H5>
            </TableCell>
            <TableCell align="right">
              <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                {totals.totalMicrocents > 0 ? formatPercentage(1) : DASH}
              </Text.H5>
            </TableCell>
            <TableCell align="right">
              <div className="flex flex-col items-end">
                <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                  {usd(totals.tracesWithUsage > 0 ? totals.totalMicrocents / totals.tracesWithUsage : 0)}
                </Text.H5>
                <Text.H6 color="foregroundMuted" noWrap>
                  {`${formatCount(totals.tracesWithUsage)} traces`}
                </Text.H6>
              </div>
            </TableCell>
            <TableCell align="right">
              <div className="flex flex-col items-end">
                <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                  {totals.calls > 0 ? formatPercentage(1) : DASH}
                </Text.H5>
                <Text.H6 color="foregroundMuted" noWrap>
                  {`${formatCount(totals.calls)} calls`}
                </Text.H6>
              </div>
            </TableCell>
            <TableCell align="right">
              <Text.H5 color="foregroundMuted" noWrap className="tabular-nums">
                {totals.calls > 0 ? usd(totals.avgPerCallMicrocents) : DASH}
              </Text.H5>
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
      {truncated > 0 ? (
        <Text.H6 color="foregroundMuted">
          {`Showing the ${breakdown.rows.length} highest-spending of ${formatCount(totals.distinctValues)} ${meta.plural}. Shares are of the window total, so the listed rows add up to less than 100%.`}
        </Text.H6>
      ) : null}
    </div>
  )
}

/**
 * Every cost measure per value of one dimension. The `% of total` and `Share of calls`
 * pair, read against `$/call`, is what the cut bubble panel was reaching for.
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
        <TableSkeleton rows={5} cols={9} />
      ) : breakdown.rows.length === 0 ? (
        <div className="flex w-full min-h-[120px] items-center justify-center rounded-lg bg-secondary px-4 py-3">
          <Text.H6 color="foregroundMuted">{`No billable usage by ${meta.plural} in this time window`}</Text.H6>
        </div>
      ) : (
        <BreakdownTable breakdown={breakdown} dimension={dimension} />
      )}
    </div>
  )
}
