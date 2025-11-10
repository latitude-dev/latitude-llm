import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { useEffect } from 'react'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { LogSources } from '@latitude-data/constants'
import useDocumentLogsAggregations from '$/stores/documentLogsAggregations'
import { useCommits } from '$/stores/commitsStore'

const ANY_SOURCE_EXCEPT_EXPERIMENT: LogSources[] = Object.values(
  LogSources,
).filter((source) => source !== LogSources.Experiment)

const DEFAULT_VALUE = 10

export function LogsSelector({
  project,
  commit,
  document,
  setFromLine,
  setToLine,
  toLine,
}: ExperimentFormPayload) {
  const { data: commits } = useCommits()

  const { data: logAggregations, isLoading } = useDocumentLogsAggregations({
    projectId: project.id,
    documentUuid: document.documentUuid,
    filterOptions: {
      commitIds: commits
        // Include all merged commits + current draft
        ?.filter((c) => !!c.mergedAt || c.id === commit.id)
        .map((c) => c.id),
      logSources: ANY_SOURCE_EXCEPT_EXPERIMENT,
    },
  })

  const maxCount = logAggregations?.totalCount ?? 0

  useEffect(() => {
    setFromLine(0)
    setToLine(Math.min(DEFAULT_VALUE, maxCount) - 1)
  }, [setFromLine, setToLine, maxCount])

  return (
    <Input
      type='number'
      name='count'
      label='Use the parameters from the latest logs'
      description='Select the number of logs to use'
      value={(toLine ?? 0) + 1}
      placeholder='Number of logs'
      onChange={(e) => {
        const n = Number(e.target.value)
        if (!isNaN(n)) setToLine(Math.min(n - 1, maxCount - 1))
      }}
      min={1}
      max={maxCount}
      disabled={isLoading}
    />
  )
}
