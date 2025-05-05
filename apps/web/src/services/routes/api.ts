import { type DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { generateDocumentLogsApiRouteWithParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/generateDocumentLogsApiRouteWithParams'

type PaginationParameters = { page: number; pageSize: number }

export const API_ROUTES = {
  workspaces: {
    current: '/api/workspaces/current',
    usage: '/api/workspaces/usage',
    onboarding: {
      root: '/api/workspaces/onboarding',
      update: '/api/workspaces/onboarding/update',
    },
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
    }),
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
  },
  users: {
    root: '/api/users',
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
            documents: {
              root: `${projectRoot}/commits/${commitUuid}/documents`,
              detail: (documentUuid: string) => {
                const documentRoot = `${projectRoot}/commits/${commitUuid}/documents/${documentUuid}`
                return {
                  root: documentRoot,
                  evaluations: {
                    root: `${documentRoot}/evaluations`,
                    detail: ({ evaluationId }: { evaluationId: number }) => ({
                      root: `${documentRoot}/evaluations/${evaluationId}`,
                      logs: {
                        root: `${documentRoot}/evaluations/${evaluationId}/logs`,
                      },
                      evaluationResults: {
                        root: `${documentRoot}/evaluations/${evaluationId}/evaluation-results`,
                        pagination: `${documentRoot}/evaluations/${evaluationId}/evaluation-results/pagination`,
                        counters: `${documentRoot}/evaluations/${evaluationId}/evaluation-results/counters`,
                        mean: `${documentRoot}/evaluations/${evaluationId}/evaluation-results/mean`,
                        modal: `${documentRoot}/evaluations/${evaluationId}/evaluation-results/modal`,
                        average: `${documentRoot}/evaluations/${evaluationId}/evaluation-results/average`,
                        averageAndCost: `${documentRoot}/evaluations/${evaluationId}/evaluation-results/average-and-cost`,
                      },
                    }),
                  },
                  evaluationResultsByDocumentContent: {
                    detail: ({ evaluationId }: { evaluationId: number }) => ({
                      root: `${documentRoot}/evaluation-results-by-document-content/${evaluationId}`,
                      pagination: `${documentRoot}/evaluation-results-by-document-content/${evaluationId}/pagination`,
                    }),
                  },
                  suggestions: {
                    root: `${documentRoot}/suggestions`,
                  },
                  evaluationsV2: {
                    root: `${documentRoot}/evaluations-v2`,
                    detail: (evaluationUuid: string) => {
                      const evaluationRoot = `${documentRoot}/evaluations-v2/${evaluationUuid}`
                      return {
                        root: evaluationRoot,
                        results: {
                          root: `${evaluationRoot}/results`,
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
                      root: `${documentRoot}/evaluations-v2/results`,
                      documentLogs: {
                        root: `${documentRoot}/evaluations-v2/results/document-logs`,
                      },
                    },
                  },
                }
              },
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
              // These are logs serialized that includes the information included
              // in the genered provider logs together with document log
              evaluatedLogs: {
                root: ({
                  page,
                  pageSize,
                  filterOptions,
                }: Partial<PaginationParameters> & {
                  filterOptions: DocumentLogFilterOptions
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/evaluatedLogs`,
                    params: {
                      page,
                      pageSize,
                      filterOptions,
                    },
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
                  excludeErrors,
                  filterOptions,
                }: PaginationParameters & {
                  excludeErrors?: boolean
                  filterOptions: DocumentLogFilterOptions
                }) =>
                  generateDocumentLogsApiRouteWithParams({
                    path: `${documentRoot}/logs/pagination`,
                    params: {
                      page,
                      pageSize,
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
              triggers: {
                root: `${documentRoot}/triggers`,
              },
            }
          },
        },
      }
    },
  },
  datasets: {
    root: '/api/datasets',
    previewLogs: {
      root: '/api/datasets/preview-logs',
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
  evaluationTemplates: {
    root: '/api/evaluationTemplates',
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
  evaluations: {
    root: '/api/evaluations',
    detail: (id: number) => ({
      root: `/api/evaluations/${id}`,
      connectedDocuments: {
        root: `/api/evaluations/${id}/connected-documents`,
      },
      prompt: {
        root: `/api/evaluations/${id}/prompt`,
      },
    }),
  },
}
