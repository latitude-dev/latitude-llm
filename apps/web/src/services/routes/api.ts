import { generateDocumentLogsApiRouteWithParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/generateDocumentLogsApiRouteWithParams'
import type {
  RunSourceGroup,
  DocumentLogFilterOptions,
} from '@latitude-data/core/constants'

type PaginationParameters = { page: number; pageSize: number }

export const API_ROUTES = {
  traces: {
    detail: (traceId: string) => ({
      root: `/api/traces/${traceId}`,
      spans: {
        detail: (spanId: string) => ({
          root: `/api/traces/${traceId}/spans/${spanId}`,
        }),
      },
    }),
  },
  workspaces: {
    current: '/api/workspaces/current',
    available: '/api/workspaces/available',
    usage: '/api/workspaces/usage',
    onboarding: {
      root: '/api/workspaces/onboarding',
      update: '/api/workspaces/onboarding/update',
    },
    limits: '/api/workspaces/limits',
  },
  apiKeys: {
    root: '/api/apiKeys',
  },
  providerApiKeys: {
    root: '/api/providerApiKeys',
    detail: (id: number) => ({
      usage: `/api/providerApiKeys/${id}/usage`,
    }),
  },
  integrations: {
    root: '/api/integrations',
    detail: (integrationName: string) => ({
      listTools: {
        root: `/api/integrations/${integrationName}/listTools`,
      },
      references: {
        root: `/api/integrations/${integrationName}/references`,
      },
    }),
    pipedream: {
      detail: (slugName: string) => ({
        root: `/api/integrations/pipedream/${slugName}`,
      }),
      apps: '/api/integrations/pipedream/apps',
    },
  },
  webhooks: {
    root: '/api/webhooks',
    detail: (id: number) => ({
      root: `/api/webhooks/${id}`,
    }),
  },
  claimedRewards: {
    root: '/api/claimedRewards',
  },
  mcpServers: {
    root: '/api/mcpServers',
    logs: (
      mcpServerId: string,
      options?: {
        tailLines?: number
        timestamps?: boolean
        previous?: boolean
        limitBytes?: number
      },
    ) => {
      const params = new URLSearchParams()
      params.append('mcpServerId', mcpServerId)

      if (options?.tailLines !== undefined) {
        params.append('tailLines', options.tailLines.toString())
      }
      if (options?.timestamps !== undefined) {
        params.append('timestamps', options.timestamps.toString())
      }
      if (options?.previous !== undefined) {
        params.append('previous', options.previous.toString())
      }
      if (options?.limitBytes !== undefined) {
        params.append('limitBytes', options.limitBytes.toString())
      }

      return `/api/mcpServers/logs?${params.toString()}`
    },
  },
  providerLogs: {
    root: '/api/providerLogs',
    detail: (providerLogId: string | number) => ({
      root: `/api/providerLogs/${providerLogId}`,
    }),
  },
  evaluations: {
    results: {
      traces: {
        root: '/api/evaluations/results/traces',
      },
    },
  },
  users: {
    root: '/api/users',
    current: '/api/users/current',
  },
  documents: {
    logs: {
      detail: (documentLogUuid: string) => ({
        chat: `/api/documents/logs/${documentLogUuid}/chat`,
      }),
    },
    detail: (documentUuid: string) => ({
      root: `/api/documents/${documentUuid}`,
      run: `/api/documents/${documentUuid}/run`,
    }),
  },
  projects: {
    root: '/api/projects',
    detail: (id: number) => {
      const projectRoot = `/api/projects/${id}`
      return {
        forImport: {
          root: `${projectRoot}/documents-for-import`,
        },
        stats: {
          root: `${projectRoot}/stats`,
        },
        commits: {
          root: `${projectRoot}/commits`,
          detail: (commitUuid: string) => ({
            root: `${projectRoot}/commits/${commitUuid}`,
            changes: {
              root: `${projectRoot}/commits/${commitUuid}/changes`,
              detail: (documentUuid: string) => {
                return {
                  root: `${projectRoot}/commits/${commitUuid}/changes/${documentUuid}`,
                }
              },
            },
            issues: {
              root: `${projectRoot}/commits/${commitUuid}/issues`,
              search: `${projectRoot}/commits/${commitUuid}/issues/search`,
              histograms: `${projectRoot}/commits/${commitUuid}/issues/histograms`,
              evaluations: `${projectRoot}/commits/${commitUuid}/issues/evaluations`,
              annotationsProgress: `${projectRoot}/commits/${commitUuid}/issues/annotationsProgress`,
              detail: (issueId: number) => {
                return {
                  root: `${projectRoot}/commits/${commitUuid}/issues/${issueId}`,
                  histograms: `${projectRoot}/commits/${commitUuid}/issues/${issueId}/histograms`,
                  spans: {
                    root: `${projectRoot}/commits/${commitUuid}/issues/${issueId}/spans`,
                  },
                  enoughAnnotations: {
                    root: `${projectRoot}/commits/${commitUuid}/issues/${issueId}/enoughAnnotations`,
                  },
                }
              },
            },
            documents: {
              root: `${projectRoot}/commits/${commitUuid}/documents`,
              detail: (documentUuid: string) => {
                const documentRoot = `${projectRoot}/commits/${commitUuid}/documents/${documentUuid}`
                return {
                  root: documentRoot,
                  suggestions: {
                    root: `${documentRoot}/suggestions`,
                  },
                  updateDocumentContent: {
                    root: `${documentRoot}/updateDocumentContent`,
                  },
                  evaluations: {
                    root: `${documentRoot}/evaluations`,
                    detail: (evaluationUuid: string) => {
                      const evaluationRoot = `${documentRoot}/evaluations/${evaluationUuid}`
                      return {
                        root: evaluationRoot,
                        results: {
                          root: `${evaluationRoot}/results`,
                          count: {
                            root: `${evaluationRoot}/results/count`,
                          },
                          pagination: {
                            root: `${evaluationRoot}/results/pagination`,
                          },
                        },
                        stats: {
                          root: `${evaluationRoot}/stats`,
                        },
                        runLlm: {
                          root: `${evaluationRoot}/run-llm`,
                        },
                      }
                    },
                    results: {
                      root: `${documentRoot}/evaluations/results`,
                      documentLogs: {
                        root: `${documentRoot}/evaluations/results/document-logs`,
                      },
                      spans: {
                        root: `${documentRoot}/evaluations/results/spans`,
                      },
                    },
                  },
                  traces: {
                    aggregations: `${documentRoot}/traces/aggregations`,
                    dailyCount: ({ days }: { days?: number }) => {
                      const params = new URLSearchParams()
                      if (days !== undefined) {
                        params.append('days', days.toString())
                      }
                      const query = params.toString()
                      return query
                        ? `${documentRoot}/traces/daily-count?${query}`
                        : `${documentRoot}/traces/daily-count`
                    },
                  },
                  runs: {
                    active: `${documentRoot}/runs/active`,
                  },
                  tools: {
                    root: `${documentRoot}/tools`,
                  },
                }
              },
            },
            triggers: {
              root: `${projectRoot}/commits/${commitUuid}/triggers`,
              detail: (triggerUuid: string) => {
                return {
                  triggerEvents: {
                    root: `${projectRoot}/commits/${commitUuid}/triggers/${triggerUuid}/triggerEvents`,
                  },
                }
              },
            },
            integrationReferences: {
              root: `${projectRoot}/commits/${commitUuid}/integrationReferences`,
            },
          }),
        },
        publishedDocuments: {
          root: `${projectRoot}/published-documents`,
        },
        documents: {
          detail: (documentUuid: string) => {
            const documentRoot = `${projectRoot}/documents/${documentUuid}`
            return {
              experiments: {
                root: `${documentRoot}/experiments`,
                paginated: (pagination: Partial<PaginationParameters>) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/experiments`,
                    params: pagination,
                  }),
                count: `${documentRoot}/experiments/count`,
                comparison: (experimentUuids: string[]) =>
                  `${documentRoot}/experiments/comparison?uuids=${experimentUuids.join(',')}`,
              },
              evaluatedLogs: {
                root: ({
                  page,
                  pageSize,
                  filterOptions,
                  configuration,
                }: Partial<PaginationParameters> & {
                  filterOptions: DocumentLogFilterOptions
                  configuration?: string
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/evaluatedSpans`,
                    params: {
                      page,
                      pageSize,
                      filterOptions,
                      configuration,
                    },
                    paramsToEncode: ['configuration'],
                  }),
              },
              logs: {
                root: ({
                  page,
                  pageSize,
                  filterOptions,
                  excludeErrors,
                }: Partial<PaginationParameters> & {
                  excludeErrors?: boolean
                  filterOptions: DocumentLogFilterOptions
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/logs`,
                    params: {
                      page,
                      pageSize,
                      excludeErrors,
                      filterOptions,
                    },
                  }),
                pagination: ({
                  page,
                  pageSize,
                  commitUuid,
                  excludeErrors,
                  filterOptions,
                }: PaginationParameters & {
                  commitUuid: string
                  excludeErrors?: boolean
                  filterOptions: DocumentLogFilterOptions
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/logs/pagination`,
                    params: {
                      page,
                      pageSize,
                      commitUuid,
                      excludeErrors,
                      filterOptions,
                    },
                  }),
                aggregations: (filterOptions: DocumentLogFilterOptions) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/logs/aggregations`,
                    params: {
                      filterOptions,
                    },
                  }),
                dailyCount: ({
                  filterOptions,
                  days,
                }: {
                  filterOptions: DocumentLogFilterOptions
                  days?: number
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/logs/daily-count`,
                    params: {
                      days,
                      filterOptions,
                    },
                  }),
                limited: ({
                  from,
                  filters,
                }: {
                  from: string | null
                  filters: DocumentLogFilterOptions
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/logs/limited`,
                    params: { from, filterOptions: filters },
                  }),
                detail: (documentLogUuid: string) => {
                  return {
                    position: ({
                      excludeErrors,
                      filterOptions,
                    }: {
                      excludeErrors?: boolean
                      filterOptions: DocumentLogFilterOptions
                    }) =>
                      generateDocumentLogsApiRouteWithParams({
                        path: `${documentRoot}/logs/${documentLogUuid}/position`,
                        params: {
                          excludeErrors,
                          filterOptions,
                        },
                      }),
                  }
                },
              },
              issues: {
                search: `${documentRoot}/issues/search`,
              },
            }
          },
        },
        runs: {
          root: `${projectRoot}/runs`,
          active: {
            root: `${projectRoot}/runs/active`,
            count: `${projectRoot}/runs/active/count`,
            detail: ({
              page,
              pageSize,
              sourceGroup,
            }: {
              page?: number
              pageSize?: number
              sourceGroup?: RunSourceGroup
            } = {}) => {
              const params = new URLSearchParams()
              if (page) params.set('page', page.toString())
              if (pageSize) params.set('pageSize', pageSize.toString())
              if (sourceGroup) params.set('sourceGroup', sourceGroup)
              return `${projectRoot}/runs/active?${params.toString()}`
            },
          },
          detail: (uuid: string) => ({
            attach: `${projectRoot}/runs/${uuid}/attach`,
          }),
        },
        activeEvaluations: {
          root: `${projectRoot}/active-evaluations`,
        },
      }
    },
  },
  datasets: {
    root: '/api/datasets',
    create: '/api/datasets/create',
    detail: (id: number) => ({ root: `/api/datasets/${id}` }),
    previewLogs: {
      root: '/api/datasets/preview-logs',
    },
    previewSpans: {
      root: '/api/datasets/preview-spans',
    },
  },
  datasetsRows: {
    root: '/api/dataset-rows',
    count: '/api/dataset-rows/count',
    withPosition: (id: number) => {
      return {
        root: `/api/dataset-rows/${id}/position`,
      }
    },
  },
  documentLogs: {
    detail: ({ id }: { id: number }) => ({
      root: `/api/documentLogs/${id}`,
    }),
    uuids: {
      detail: ({ uuid }: { uuid: string }) => {
        const root = `/api/documentLogs/uuids/${uuid}`
        return {
          root,
        }
      },
    },
    evaluationResults: {
      root: `/api/documentLogs/evaluation-results`,
    },
    downloadLogs: {
      root: `/api/documentLogs/download-logs`,
    },
  },
  spans: {
    limited: {
      root: '/api/spans/limited',
    },
    downloadSpans: {
      root: `/api/spans/download-spans`,
    },
  },
  workspaceFeatures: {
    root: '/api/workspaceFeatures',
    byName: (featureName: string) => `/api/workspaceFeatures/${featureName}`,
  },
  admin: {
    workspaces: {
      root: '/api/admin/workspaces',
      detail: (workspaceId: number) => {
        const root = `/api/admin/workspaces/${workspaceId}`
        return {
          limits: {
            root: `${root}/limits`,
          },
          grants: {
            root: `${root}/grants`,
          },
        }
      },
    },
    features: {
      root: '/api/admin/features',
      workspaces: (featureId: number) =>
        `/api/admin/features/${featureId}/workspaces`,
      toggle: (featureId: number) => `/api/admin/features/${featureId}/toggle`,
    },
    promocodes: {
      root: '/api/admin/promocodes',
    },
    rewards: {
      pending: {
        root: '/api/admin/rewards/pending',
      },
    },
  },
  conversations: {
    root: '/api/conversations',
    detail: (conversationId: string) => {
      const conversationRoot = `/api/conversations/${conversationId}`
      return {
        root: conversationRoot,
        traceIds: {
          root: `${conversationRoot}/trace-ids`,
        },
      }
    },
  },
  latte: {
    usage: {
      root: `/api/latte/usage`,
    },
    debug: {
      versions: {
        root: `/api/latte/debug/versions`,
      },
    },
    threads: {
      detail: (threadUuid: string) => ({
        checkpoints: {
          root: `/api/latte/threads/${threadUuid}/checkpoints`,
        },
      }),
    },
  },
  claimedPromocodes: {
    root: '/api/claimedPromocodes',
  },
}
