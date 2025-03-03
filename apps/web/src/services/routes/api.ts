import { DocumentLogFilterOptions } from '@latitude-data/core/browser'
import { generateDocumentLogsApiRouteWithParams } from '@latitude-data/core/services/documentLogs/logsFilterUtils/generateDocumentLogsApiRouteWithParams'

type PaginationParameters = { page: number; pageSize: number }

export const API_ROUTES = {
  workspaces: {
    current: '/api/workspaces/current',
    usage: '/api/workspaces/usage',
  },
  apiKeys: {
    root: '/api/apiKeys',
  },
  providerApiKeys: {
    root: '/api/providerApiKeys',
  },
  integrations: {
    root: '/api/integrations',
  },
  claimedRewards: {
    root: '/api/claimedRewards',
  },
  providerLogs: {
    root: '/api/providerLogs',
  },
  users: {
    root: '/api/users',
  },
  traces: {
    root: '/api/traces',
  },
  documents: {
    detail: (documentUuid: string) => ({
      root: `/api/documents/${documentUuid}`,
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
            }
          },
        },
      }
    },
  },
  datasets: {
    root: '/api/datasets',
    detail: (id: number) => ({
      preview: {
        root: `/api/datasets/${id}/preview`,
      },
    }),
  },
  datasetsV2: {
    root: '/api/datasets-v2',
  },
  datasetsRows: {
    root: '/api/dataset-rows',
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
    generateCsv: {
      detail: ({ documentLogIds }: { documentLogIds: number[] }) => {
        return {
          root: `/api/documentLogs/generate-csv?ids=${documentLogIds.join(',')}`,
        }
      },
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
