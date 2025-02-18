// TODO: Review if we can remove this declarations
export enum Queues {
  defaultQueue = 'defaultQueue',
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
    ],
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
      'notifyToClientEvaluationResultCreatedJob',
      'runLiveEvaluationsJob',
      'sendInvitationToUserJob',
      'sendMagicLinkJob',
      'sendReferralInvitationJob',
    ],
  },
  [Queues.liveEvaluationsQueue]: {
    name: Queues.liveEvaluationsQueue,
    jobs: ['runLiveEvaluationJob'],
  },
} as const
