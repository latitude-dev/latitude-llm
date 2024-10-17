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
    ],
  },
  [Queues.liveEvaluationsQueue]: {
    name: Queues.liveEvaluationsQueue,
    jobs: ['runLiveEvaluationJob'],
  },
} as const
