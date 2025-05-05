import { MetadataItemTooltip } from '$/components/MetadataItem'
import { ProviderLogDto } from '@latitude-data/core/browser'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { FinishReason } from 'ai'

const REASONS_FINISH: Record<FinishReason, string> = {
  stop: 'This indicates that the response ended because it reached a stopping point naturally.',
  length:
    'This means the response ended because it reached the maximum number of tokens (words or characters) allowed for the response.',
  'content-filter':
    'This means the response was cut off because it was flagged as potentially inappropriate, harmful, or sensitive based on AI provider content policies.',
  'tool-calls': 'Model triggered tool calls',
  error:
    ' This indicates that the model was unable to complete the response due to a technical issue or an unexpected problem. It could happen because of internal failures, server issues, or other unforeseen errors during the generation process on the AI provider servers.',
  other:
    'Model finish without a specific reason. This could be due to a variety of reasons, such as a timeout, a server issue, or a problem with the input data.',
  unknown: 'The model has not transmited a finish reason.',
}
const ERROR_FINISH_REASON: FinishReason[] = [
  'error',
  'other',
  'unknown',
  'content-filter',
  'length',
]

export function FinishReasonItem({
  providerLog,
}: {
  providerLog: ProviderLogDto
}) {
  const finishReason = providerLog.finishReason as FinishReason
  const color = ERROR_FINISH_REASON.includes(finishReason)
    ? 'destructiveMutedForeground'
    : 'foregroundMuted'
  return (
    <MetadataItemTooltip
      label='Finish reason'
      loading={!providerLog}
      trigger={<Text.H5 color={color}>{finishReason}</Text.H5>}
      tooltipContent={REASONS_FINISH[finishReason] ?? 'Unknown reason'}
    />
  )
}
