// TODO: Review if we can remove this declarations
export enum Queues {
  defaultQueue = 'defaultQueue',
  maintenanceQueue = 'maintenanceQueue',
  eventsQueue = 'eventsQueue',
  eventHandlersQueue = 'eventHandlersQueue',
  liveEvaluationsQueue = 'liveEvaluationsQueue',
}

// TODO: Review if we can remove this declarations
export enum Jobs {
  createProviderLogJob = 'createProviderLogJob',
  createDocumentLogJob = 'createDocumentLogJob',
  createEventJob = 'createEventJob',
  publishEventJob = 'publishEventJob',
  runBatchEvaluationJob = 'runBatchEvaluationJob',
  runDocumentForEvaluationJob = 'runDocumentForEvaluationJob',
  runDocumentInBatchJob = 'runDocumentInBatchJob',
  runDocumentJob = 'runDocumentJob',
  runEvaluationJob = 'runEvaluationJob',
  publishToAnalyticsJob = 'publishToAnalyticsJob',
  runLiveEvaluationJob = 'runLiveEvaluationJob',
  uploadDocumentLogsJob = 'uploadDocumentLogsJob',
  processOtlpTracesJob = 'processOtlpTracesJob',
  createDocumentLogFromSpanJob = 'createDocumentLogFromSpanJob',
  createDocumentLogsFromSpansJob = 'createDocumentLogsFromSpansJob',
  generateDocumentSuggestionJob = 'generateDocumentSuggestionJob',
  requestDocumentSuggestionsJob = 'requestDocumentSuggestionsJob',
  cleanDocumentSuggestionsJob = 'cleanDocumentSuggestionsJob',
}

export const QUEUES = {
  [Queues.defaultQueue]: {
    name: Queues.defaultQueue,
    jobs: [
      'createDocumentLogFromSpanJob',
      'createDocumentLogJob',
      'createProviderLogJob',
      'processOtlpTracesJob',
      'runBatchEvaluationJob',
      'runDocumentForEvaluationJob',
      'runDocumentInBatchJob',
      'runDocumentJob',
      'runEvaluationJob',
      'uploadDocumentLogsJob',
      'generateDocumentSuggestionJob',
      'requestDocumentSuggestionsJob',
    ],
  },
  [Queues.maintenanceQueue]: {
    name: Queues.maintenanceQueue,
    jobs: ['cleanDocumentSuggestionsJob'],
  },
  [Queues.eventsQueue]: {
    name: Queues.eventsQueue,
    jobs: ['publishEventJob', 'createEventJob', 'publishToAnalyticsJob'],
  },
  [Queues.eventHandlersQueue]: {
    name: Queues.eventHandlersQueue,
    jobs: [
      'createClaimInvitationReferralJob',
      'createDocumentLogsFromSpansJob',
      'createLoopsContact',
      'notifyClientOfBulkCreateTracesAndSpans',
      'notifyToClientDocumentLogCreatedJob',
      'notifyClientOfDocumentSuggestionCreated',
      'notifyClientOfEvaluationResultV2Created',
      'notifyToClientEvaluationResultCreatedJob',
      'runLiveEvaluationsJob',
      'sendInvitationToUserJob',
      'sendMagicLinkJob',
      'sendReferralInvitationJob',
      'sendSuggestionNotification',
      'requestDocumentSuggestionJob',
      'createDatasetRowsJob',
    ],
  },
  [Queues.liveEvaluationsQueue]: {
    name: Queues.liveEvaluationsQueue,
    jobs: ['runLiveEvaluationJob'],
  },
} as const
