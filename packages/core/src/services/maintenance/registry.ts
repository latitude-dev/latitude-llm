type ParamType = 'number' | 'string'

type JobParam = {
  name: string
  type: ParamType
  required: boolean
  description: string
}

export type MaintenanceJobDefinition = {
  name: string
  displayName: string
  description: string
  params: JobParam[]
  hasLogs: boolean
}

export const MAINTENANCE_JOB_REGISTRY: MaintenanceJobDefinition[] = [
  {
    name: 'backfillClickhouseJob',
    displayName: 'Backfill ClickHouse',
    description:
      'Enqueues span and evaluation result backfill jobs for all configured workspaces.',
    params: [],
    hasLogs: true,
  },
  {
    name: 'backfillSpansToClickhouseJob',
    displayName: 'Backfill Spans to ClickHouse',
    description:
      'Backfills spans from PostgreSQL to ClickHouse for a specific workspace. Processes in batches and re-enqueues.',
    params: [
      {
        name: 'workspaceId',
        type: 'number',
        required: true,
        description: 'The workspace ID to backfill spans for',
      },
      {
        name: 'batchSize',
        type: 'number',
        required: false,
        description: 'Number of spans per batch (default: 1000)',
      },
    ],
    hasLogs: true,
  },
  {
    name: 'backfillSpanReferencesJob',
    displayName: 'Backfill Span References',
    description:
      'Backfills missing span references across span types and republishes updated rows to ClickHouse.',
    params: [
      {
        name: 'workspaceId',
        type: 'number',
        required: true,
        description: 'The workspace ID to backfill span references for',
      },
      {
        name: 'batchSize',
        type: 'number',
        required: false,
        description: 'Number of trace IDs to process per batch (default: 500)',
      },
    ],
    hasLogs: true,
  },
  {
    name: 'backfillEvaluationResultsToClickhouseJob',
    displayName: 'Backfill Eval Results to ClickHouse',
    description:
      'Backfills evaluation results from PostgreSQL to ClickHouse for a specific workspace. Processes in batches and re-enqueues.',
    params: [
      {
        name: 'workspaceId',
        type: 'number',
        required: true,
        description: 'The workspace ID to backfill evaluation results for',
      },
      {
        name: 'batchSize',
        type: 'number',
        required: false,
        description: 'Number of results per batch (default: 1000)',
      },
    ],
    hasLogs: true,
  },
  {
    name: 'cleanupWorkspaceOldLogsJob',
    displayName: 'Cleanup Workspace Old Logs',
    description:
      'Removes old logs for a specific workspace based on retention policy.',
    params: [
      {
        name: 'workspaceId',
        type: 'number',
        required: true,
        description: 'The workspace ID to clean up logs for',
      },
      {
        name: 'batchSize',
        type: 'number',
        required: false,
        description: 'Number of logs to process per batch',
      },
    ],
    hasLogs: false,
  },
  {
    name: 'clearConversationCacheJob',
    displayName: 'Clear Conversation Cache',
    description: 'Clears all cached conversation data from Redis.',
    params: [],
    hasLogs: false,
  },
  {
    name: 'dailyAlignmentMetricUpdateJob',
    displayName: 'Daily Alignment Metric Update',
    description:
      'Runs the daily update of evaluation alignment metrics across all workspaces.',
    params: [],
    hasLogs: false,
  },
  {
    name: 'destroyWorkspaceJob',
    displayName: 'Destroy Workspace',
    description:
      'Permanently destroys a workspace and all associated data. Use with extreme caution.',
    params: [
      {
        name: 'workspaceId',
        type: 'number',
        required: true,
        description: 'The workspace ID to destroy',
      },
    ],
    hasLogs: false,
  },
  {
    name: 'notifyWorkspacesFinishingFreeTrialJob',
    displayName: 'Notify Free Trial Ending',
    description:
      'Sends notifications to workspaces whose free trial is about to end.',
    params: [],
    hasLogs: false,
  },
  {
    name: 'scheduleWorkspaceCleanupJobs',
    displayName: 'Schedule Workspace Cleanup',
    description:
      'Schedules cleanup jobs for all workspaces based on their retention policies.',
    params: [],
    hasLogs: false,
  },
  {
    name: 'updateEvaluationAlignmentJob',
    displayName: 'Update Evaluation Alignment',
    description: 'Recalculates alignment metrics for a specific evaluation.',
    params: [
      {
        name: 'workspaceId',
        type: 'number',
        required: true,
        description: 'The workspace ID',
      },
      {
        name: 'commitId',
        type: 'number',
        required: true,
        description: 'The commit ID',
      },
      {
        name: 'evaluationUuid',
        type: 'string',
        required: true,
        description: 'The evaluation UUID',
      },
      {
        name: 'documentUuid',
        type: 'string',
        required: true,
        description: 'The document UUID',
      },
      {
        name: 'issueId',
        type: 'number',
        required: true,
        description: 'The issue ID',
      },
      {
        name: 'source',
        type: 'string',
        required: true,
        description:
          'The recalculation source (e.g. "evaluation_result_created")',
      },
    ],
    hasLogs: false,
  },
]

export function findJobDefinition(name: string) {
  return MAINTENANCE_JOB_REGISTRY.find((j) => j.name === name)
}
