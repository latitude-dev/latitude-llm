import { useMemo } from 'react'

import { EvaluationDto, ProviderLogDto } from '@latitude-data/core/browser'
import { EvaluationResultWithMetadataAndErrors } from '@latitude-data/core/repositories'
import { ClickToCopy, Text } from '@latitude-data/web-ui'
import { formatCostInMillicents } from '$/app/_lib/formatUtils'
import { RunErrorMessage } from '$/app/(private)/projects/[projectId]/versions/[commitUuid]/_components/RunErrorMessage'
import useProviderApiKeys from '$/stores/providerApiKeys'
import { format } from 'date-fns'

import {
  FinishReasonItem,
  MetadataItem,
  MetadataItemTooltip,
} from '../../../../../../[documentUuid]/_components/MetadataItem'
import { ResultCellContent } from '../EvaluationResultsTable'

function ProviderLogItems({
  providerLog,
  evaluationResult,
}: {
  evaluationResult: EvaluationResultWithMetadataAndErrors
  providerLog: ProviderLogDto
}) {
  const { data: providers, isLoading: providersLoading } = useProviderApiKeys()
  const providerId = providerLog?.providerId
  const providerName = useMemo(
    () => providers.find((p) => p.id === providerId)?.name ?? 'Unknown',
    [providers, providerId],
  )
  return (
    <>
      <MetadataItem
        label='Timestamp'
        value={format(evaluationResult.createdAt, 'PPp')}
      />
      <FinishReasonItem providerLog={providerLog} />
      <MetadataItem label='Tokens' value={providerLog.tokens.toString()} />
      <MetadataItem label='Model' value={providerLog.model ?? 'Unknown'} />
      <MetadataItem label='Provider' value={providerName} />
      <MetadataItemTooltip
        label='Cost'
        loading={providersLoading}
        trigger={
          <Text.H5 color='foregroundMuted'>
            {formatCostInMillicents(evaluationResult.costInMillicents ?? 0)}
          </Text.H5>
        }
        tooltipContent="Note: This is just an estimate based on the token usage and your provider's pricing. Actual cost may vary."
      />
    </>
  )
}

export function EvaluationResultMetadata({
  evaluation,
  evaluationResult,
  providerLog,
}: {
  evaluation: EvaluationDto
  evaluationResult: EvaluationResultWithMetadataAndErrors
  providerLog?: ProviderLogDto
}) {
  const reasoning = useMemo(() => {
    if (!providerLog) return '-'

    try {
      const response = JSON.parse(providerLog?.response)

      if (response) {
        return response.reason || '-'
      }
      return '-'
    } catch (e) {
      return '-'
    }
  }, [providerLog])

  return (
    <>
      <RunErrorMessage error={evaluationResult.error} />
      <MetadataItem label='Result id'>
        <ClickToCopy copyValue={evaluationResult.id.toString()}>
          <Text.H5 align='right' color='foregroundMuted'>
            {evaluationResult.id}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      <MetadataItem
        label='Timestamp'
        value={format(evaluationResult.createdAt, 'PPp')}
      />
      <MetadataItem label='Version'>
        <ClickToCopy copyValue={evaluationResult.commit.uuid}>
          <Text.H5 align='right' color='foregroundMuted'>
            {evaluationResult.commit.uuid.split('-')[0]}
          </Text.H5>
        </ClickToCopy>
      </MetadataItem>
      {providerLog ? (
        <ProviderLogItems
          providerLog={providerLog}
          evaluationResult={evaluationResult}
        />
      ) : null}
      {evaluationResult.result ? (
        <MetadataItem label='Result' loading={!evaluation || !evaluationResult}>
          <ResultCellContent
            evaluation={evaluation}
            value={evaluationResult.result}
          />
        </MetadataItem>
      ) : null}
      <MetadataItem stacked label='Result reasoning' value={reasoning} />
    </>
  )
}
