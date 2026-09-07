import type { FlaggerCoverageRow } from "@domain/flaggers"
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeleton,
  Tabs,
  Text,
} from "@repo/ui"
import { useMemo, useState } from "react"
import { useProjectFlaggerCoverage } from "../../../../../../domains/flaggers/flaggers.collection.ts"
import type { FlaggerRecord } from "../../../../../../domains/flaggers/flaggers.functions.ts"
import { useParamState } from "../../../../../../lib/hooks/useParamState.ts"
import { SettingsCard } from "./settings-card.tsx"

const COVERAGE_WINDOWS = [7, 14, 21, 28] as const
type CoverageWindowDays = (typeof COVERAGE_WINDOWS)[number]

const isCoverageWindow = (value: string): value is `${CoverageWindowDays}` =>
  COVERAGE_WINDOWS.some((days) => String(days) === value)

const formatCount = (value: number) => new Intl.NumberFormat().format(value)
const formatShare = (value: number) => `${Math.round(value * 100)}%`

function CalibrationCell({ row }: { readonly row: FlaggerCoverageRow }) {
  const hasMissingEvidence = row.missingTelemetry > 0 || row.unknownSelectionProbability > 0
  return (
    <div className="flex min-w-40 flex-col items-start gap-1">
      {row.positiveFindings === 0 ? (
        <Badge variant="muted" size="small">
          No findings
        </Badge>
      ) : row.calibrationReadyFindings === row.positiveFindings ? (
        <Badge variant="successMuted" size="small">
          {formatCount(row.calibrationReadyFindings)} ready
        </Badge>
      ) : (
        <Badge variant="warningMuted" size="small">
          {formatCount(row.calibrationReadyFindings)} of {formatCount(row.positiveFindings)} ready
        </Badge>
      )}
      {hasMissingEvidence ? (
        <div className="flex flex-col gap-0.5">
          {row.missingTelemetry > 0 ? (
            <Text.H7 color="foregroundMuted">{formatCount(row.missingTelemetry)} missing decisions</Text.H7>
          ) : null}
          {row.unknownSelectionProbability > 0 ? (
            <Text.H7 color="foregroundMuted">
              {formatCount(row.unknownSelectionProbability)} unknown probabilities
            </Text.H7>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export function FlaggerCoverageSection({
  projectId,
  flaggers,
}: {
  readonly projectId: string
  readonly flaggers: readonly FlaggerRecord[]
}) {
  const [windowRaw, setWindowRaw] = useParamState("flaggerCoverageDays", "28", { validate: isCoverageWindow })
  const days = Number(windowRaw) as CoverageWindowDays
  const [windowEndMs] = useState(() => Date.now())
  const range = useMemo(
    () => ({
      fromIso: new Date(windowEndMs - days * 24 * 60 * 60 * 1000).toISOString(),
      toIso: new Date(windowEndMs).toISOString(),
    }),
    [days, windowEndMs],
  )
  const { data, isLoading, error } = useProjectFlaggerCoverage({ projectId, ...range })
  const flaggersBySlug = useMemo(() => new Map(flaggers.map((flagger) => [flagger.slug, flagger])), [flaggers])

  return (
    <SettingsCard
      title="Observation coverage"
      description="Completed production sessions each flagger examined in the selected window."
      actions={
        <Tabs
          variant="bordered"
          size="sm"
          options={COVERAGE_WINDOWS.map((windowDays) => ({ id: String(windowDays), label: `${windowDays}d` }))}
          active={windowRaw}
          onSelect={(value) => {
            if (isCoverageWindow(value)) setWindowRaw(value)
          }}
        />
      }
    >
      {isLoading && !data ? (
        <TableSkeleton cols={12} rows={5} />
      ) : error ? (
        <Text.H6 color="destructive">Coverage could not be loaded</Text.H6>
      ) : (
        <div className="flex flex-col gap-3">
          {data?.rows[0]?.eligibleSessions === 0 ? (
            <Text.H6 color="foregroundMuted">No eligible sessions ended in this window</Text.H6>
          ) : null}
          <Table>
            <TableHeader>
              <TableRow hoverable={false}>
                <TableHead>Flagger</TableHead>
                <TableHead align="right">Eligible</TableHead>
                <TableHead align="right">Examined</TableHead>
                <TableHead
                  align="right"
                  tooltipMessage="Sessions with a terminal result and a usable selection probability."
                >
                  Readable
                </TableHead>
                <TableHead align="right">Deterministic</TableHead>
                <TableHead align="right">Hinted</TableHead>
                <TableHead align="right">Uniform</TableHead>
                <TableHead align="right">Ordinary</TableHead>
                <TableHead align="right">Skipped</TableHead>
                <TableHead align="right">Rate-limited</TableHead>
                <TableHead align="right">Findings</TableHead>
                <TableHead tooltipMessage="Positive findings with known selection probability can enter a calibrated score.">
                  Calibration
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.rows ?? []).map((row) => {
                const flagger = flaggersBySlug.get(row.flaggerSlug)
                return (
                  <TableRow key={row.flaggerSlug} verticalPadding hoverable={false}>
                    <TableCell>
                      <div className="flex min-w-44 flex-col gap-0.5">
                        <Text.H6B>{flagger?.name ?? row.flaggerSlug}</Text.H6B>
                        <Text.H7 color="foregroundMuted">{row.flaggerSlug}</Text.H7>
                      </div>
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.eligibleSessions)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.examinedSessions)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      <div className="flex flex-col items-end gap-0.5">
                        <Text.H6>{formatCount(row.readableSessions)}</Text.H6>
                        <Text.H7 color="foregroundMuted">{formatShare(row.readableShare)}</Text.H7>
                      </div>
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.selectionPaths.deterministic)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.selectionPaths.hinted)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.selectionPaths.uniformSample)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.selectionPaths.ordinarySample)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.selectionPaths.skipped)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.selectionPaths.rateLimited)}
                    </TableCell>
                    <TableCell align="right" className="tabular-nums">
                      {formatCount(row.positiveFindings)}
                    </TableCell>
                    <TableCell>
                      <CalibrationCell row={row} />
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </SettingsCard>
  )
}
