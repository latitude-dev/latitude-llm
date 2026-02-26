import type { RunSourceGroup } from '@latitude-data/core/constants'
import { buildExperimentsApiParams } from '@latitude-data/core/data-access/experiments/buildApiParams'

type PaginationParameters = { page: number; pageSize: number }

export const API_ROUTES = {
  pricings: {
    detail: (slug: string) => ({
      root: `/api/pricings/${slug}`,
    }),
  },
  traces: {
    detail: (traceId: string) => ({
      root: `/api/traces/${traceId}`,
      spans: {
        detail: (spanId: string) => ({
          root: `/api/traces/${traceId}/spans/${spanId}`,
          messages: `/api/traces/${traceId}/spans/${spanId}/messages`,
        }),
      },
    }),
    countByDocument: {
      root: '/api/traces/count-by-document',
    },
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
    oauth: {
      callback: '/api/integrations/oauth/callback',
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
  evaluations: {
    root: '/api/evaluations',
    results: {
      traces: {
        root: '/api/evaluations/results/traces',
      },
    },
    extractOutput: {
      root: '/api/evaluations/extract-output',
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
  evaluatedSpans: {
    root: '/api/evaluatedSpans',
  },
  projects: {
    root: '/api/projects',
    detail: (id: number) => {
      const projectRoot = `/api/projects/${id}`
      return {
        forImport: {
          root: `${projectRoot}/documents-for-import`,
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
        documents: {
          detail: (documentUuid: string) => {
            const documentRoot = `${projectRoot}/documents/${documentUuid}`
            return {
              experiments: {
                root: `${documentRoot}/experiments`,
                paginated: (pagination: Partial<PaginationParameters>) =>
                  buildExperimentsApiParams({
                    path: `${documentRoot}/experiments`,
                    params: pagination,
                  }),
                count: `${documentRoot}/experiments/count`,
                comparison: (experimentUuids: string[]) =>
                  `${documentRoot}/experiments/comparison?uuids=${experimentUuids.join(',')}`,
              },
              issues: {
                search: `${documentRoot}/issues/search`,
              },
              optimizations: {
                root: `${documentRoot}/optimizations`,
                count: `${documentRoot}/optimizations/count`,
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
  spans: {
    limited: {
      root: '/api/spans/limited',
    },
    downloadSpans: {
      root: `/api/spans/download-spans`,
    },
    hasProductionSpans: {
      root: '/api/spans/has-production-spans',
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
    workers: {
      root: '/api/admin/workers',
      detail: (queueName: string) => ({
        root: `/api/admin/workers/${queueName}`,
      }),
      workspace: (workspaceId: number) => ({
        root: `/api/admin/workers/workspace/${workspaceId}`,
      }),
    },
    maintenance: {
      root: '/api/admin/maintenance',
      detail: (jobId: string) => ({
        logs: `/api/admin/maintenance/jobs/${jobId}/logs`,
      }),
    },
  },
  conversations: {
    detail: (conversationId: string) => {
      const conversationRoot = `/api/conversations/${conversationId}`
      return {
        root: conversationRoot,
        traceIds: {
          root: `${conversationRoot}/trace-ids`,
        },
        spans: {
          detail: (spanId: string) => ({
            root: `${conversationRoot}/spans/${spanId}`,
          }),
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
  integrationHeaderPresets: {
    detail: (integrationId: number) => ({
      root: `/api/integrationHeaderPresets/${integrationId}`,
    }),
  },
  models: {
    cost: {
      root: '/api/models/cost',
    },
  },
}
