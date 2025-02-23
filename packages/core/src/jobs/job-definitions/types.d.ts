import type {
  DocumentLogCreatedEvent,
  LatitudeEvent,
} from '../../events/events'
import type { CreateProviderLogJobProps } from '../../events/handlers/createProviderLogJob'
import type { Jobs, Queues } from '../constants'
import type { RunDocumentForEvaluationJobData } from './batchEvaluations'
import type { RunBatchEvaluationJobParams } from './batchEvaluations/runBatchEvaluationJob'
import type { RunEvaluationJobData } from './batchEvaluations/runEvaluationJob'
import type { CreateDocumentLogFromSpanJobData } from './documentLogs/createDocumentLogFromSpanJob'
import type { RunDocumentInBatchJobProps } from './documents/runDocumentInBatchJob'
import type { RunDocumentJobData } from './documents/runDocumentJob'
import type { UploadDocumentLogsJobData } from './documents/uploadDocumentLogsJob'
import type { CleanDocumentSuggestionsJobData } from './documentSuggestions/cleanDocumentSuggestionsJob'
import type { GenerateDocumentSuggestionJobData } from './documentSuggestions/generateDocumentSuggestionJob'
import type { RequestDocumentSuggestionsJobData } from './documentSuggestions/requestDocumentSuggestionsJob'
import type { RunLiveEvaluationJobData } from './liveEvaluations/runLiveEvaluationJob'

export type JobDataMap = {
  [Jobs.publishEventJob]: LatitudeEvent
  [Jobs.createProviderLogJob]: CreateProviderLogJobProps
  [Jobs.createDocumentLogJob]: DocumentLogCreatedEvent
  [Jobs.createEventJob]: LatitudeEvent
  [Jobs.runBatchEvaluationJob]: RunBatchEvaluationJobParams
  [Jobs.runDocumentForEvaluationJob]: RunDocumentForEvaluationJobData
  [Jobs.runDocumentInBatchJob]: RunDocumentInBatchJobProps
  [Jobs.runDocumentJob]: RunDocumentJobData
  [Jobs.runEvaluationJob]: RunEvaluationJobData
  [Jobs.publishToAnalyticsJob]: LatitudeEvent
  [Jobs.runLiveEvaluationJob]: RunLiveEvaluationJobData
  [Jobs.uploadDocumentLogsJob]: UploadDocumentLogsJobData
  [Jobs.createDocumentLogFromSpanJob]: CreateDocumentLogFromSpanJobData
  [Jobs.generateDocumentSuggestionJob]: GenerateDocumentSuggestionJobData
  [Jobs.requestDocumentSuggestionsJob]: RequestDocumentSuggestionsJobData
  [Jobs.cleanDocumentSuggestionsJob]: CleanDocumentSuggestionsJobData
}

type JobData<J extends Jobs> = J extends keyof JobDataMap
  ? JobDataMap[J]
  : never

type JobSpec<J extends Jobs = Jobs> = {
  name: J
  data: JobData<J>
}

export type JobDefinition = {
  [K in Queues]: {
    [K in Jobs]: JobSpec<K>
  }
}
