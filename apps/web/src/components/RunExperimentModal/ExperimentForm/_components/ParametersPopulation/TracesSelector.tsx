import { ExperimentFormPayload } from '../../useExperimentFormPayload'
import { useEffect } from 'react'
import { Input } from '@latitude-data/web-ui/atoms/Input'
import { LogSources } from '@latitude-data/constants'
import { useTracesCountByDocument } from '$/stores/traces/countByDocument'

const ANY_SOURCE_EXCEPT_EXPERIMENT: LogSources[] = Object.values(
  LogSources,
).filter((source) => source !== LogSources.Experiment)

const DEFAULT_VALUE = 10

export function TracesSelector({
  project,
  commit,
  document,
  setFromLine,
  setToLine,
  toLine,
}: ExperimentFormPayload) {
  const {
    data: { count: maxCount },
    isLoading,
  } = useTracesCountByDocument({
    projectId: project.id,
    commitUuid: commit.uuid,
    documentUuid: document.documentUuid,
    logSources: ANY_SOURCE_EXCEPT_EXPERIMENT,
  })

  useEffect(() => {
    setFromLine(0)
    setToLine(Math.min(DEFAULT_VALUE, maxCount) - 1)
  }, [setFromLine, setToLine, maxCount])

  return (
    <Input
      type='number'
      name='count'
      label='Use the parameters from the latest traces'
      description='Select the number of traces to use'
      value={(toLine ?? 0) + 1}
      placeholder='Number of traces'
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
