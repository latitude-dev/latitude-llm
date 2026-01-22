// FIXME: Remove unnecessary "Queue" suffixes
export enum Queues {
  defaultQueue = 'default',
  evaluationsQueue = 'evaluations',
  eventHandlersQueue = 'eventHandlers',
  eventsQueue = 'events',
  maintenanceQueue = 'maintenance',
  notificationsQueue = 'notifications',
  webhooksQueue = 'webhooks',
  documentsQueue = 'documentsQueue',
  tracingQueue = 'tracing',
  latteQueue = 'latteQueue',
  runsQueue = 'runsQueue',
  issuesQueue = 'issuesQueue',
  generateEvaluationsQueue = 'generateEvaluationsQueue',
  optimizationsQueue = 'optimizationsQueue',
  deadLetterQueue = 'deadLetter',
}
