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
}

export const QUEUES = {
  [Queues.defaultQueue]: {
    name: Queues.defaultQueue,
    jobs: [
      'createProviderLogJob',
      'runBatchEvaluationJob',
      'runDocumentForEvaluationJob',
      'runDocumentInBatchJob',
      'runDocumentJob',
      'runEvaluationJob',
      'uploadDocumentLogsJob',
      'createDocumentLogJob',
      'processOtlpTracesJob',
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
      'notifyToClientDocumentLogCreatedJob',
      'notifyToClientEvaluationResultCreatedJob',
      'runLiveEvaluationsJob',
      'sendInvitationToUserJob',
      'sendMagicLinkJob',
      'sendReferralInvitationJob',
      'createLoopsContact',
    ],
  },
  [Queues.liveEvaluationsQueue]: {
    name: Queues.liveEvaluationsQueue,
    jobs: ['runLiveEvaluationJob'],
  },
} as const
