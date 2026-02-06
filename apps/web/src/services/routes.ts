import { PUBLIC_ROOT_PATHS } from '$/services/auth/constants'
import { HEAD_COMMIT } from '@latitude-data/core/constants'
import { Pagination } from '@latitude-data/core/helpers'
import { API_ROUTES } from './routes/api'

export type IDatasetSettingsModal = 'new' | 'generate'

export enum DocumentRoutes {
  editor = 'editor',
  logs = 'logs',
  evaluations = 'evaluations',
  experiments = 'experiments',
  traces = 'traces',
  optimizations = 'optimizations',
}

export enum EvaluationRoutes {
  editor = 'editor',
}

export enum BackofficeRoutes {
  search = 'search',
  usageOverview = 'usageOverview',
  features = 'features',
  promocodes = 'promocodes',
  billing = 'billing',
  integrations = 'integrations',
  triggers = 'triggers',
  workers = 'workers',
  errorTests = 'errorTests',
}

const BACKOFFICE_ROOT = '/backoffice'

export const ROUTES = {
  root: '/',
  api: API_ROUTES,
  actions: {
    cloneAgent: {
      root: '/actions/clone-agent',
      withUuid: (uuid: string) =>
        `${ROUTES.actions.cloneAgent.root}?uuid=${uuid}`,
    },
  },
  onboarding: {
    root: '/onboarding',
  },
  choosePricingPlan: {
    root: '/choose-plan',
  },
  backoffice: {
    root: BACKOFFICE_ROOT,
    [BackofficeRoutes.search]: {
      root: `${BACKOFFICE_ROOT}/search`,
      workspace: (id: number) => `${BACKOFFICE_ROOT}/search/workspace/${id}`,
      user: (email: string) =>
        `${BACKOFFICE_ROOT}/search/user/${encodeURIComponent(email)}`,
      project: (id: number) => `${BACKOFFICE_ROOT}/search/project/${id}`,
    },
    [BackofficeRoutes.usageOverview]: {
      root: `${BACKOFFICE_ROOT}/usage-overview`,
    },
    [BackofficeRoutes.features]: {
      root: `${BACKOFFICE_ROOT}/features`,
    },
    [BackofficeRoutes.promocodes]: {
      root: `${BACKOFFICE_ROOT}/promocodes`,
    },
    [BackofficeRoutes.billing]: {
      root: `${BACKOFFICE_ROOT}/billing`,
    },
    [BackofficeRoutes.integrations]: {
      root: `${BACKOFFICE_ROOT}/integrations`,
    },
    [BackofficeRoutes.triggers]: {
      root: `${BACKOFFICE_ROOT}/triggers`,
    },
    [BackofficeRoutes.workers]: {
      root: `${BACKOFFICE_ROOT}/workers`,
    },
    [BackofficeRoutes.errorTests]: {
      root: `${BACKOFFICE_ROOT}/error-tests`,
      server: `${BACKOFFICE_ROOT}/error-tests/server`,
    },
  },
  noWorkspace: {
    root: '/no-workspace',
  },
  settings: {
    root: '/settings',
    webhooks: {
      new: {
        root: '/settings/webhooks/new',
      },
    },
    apiKeys: {
      new: '/settings/api-keys/new',
      destroy: (id: number) => `/settings/api-keys/${id}/destroy`,
      update: (id: number) => `/settings/api-keys/${id}/update`,
    },
    providerApiKeys: {
      new: {
        root: '/settings/provider-api-keys/new',
      },
      destroy: (id: number) => {
        return { root: `/settings/provider-api-keys/${id}/destroy` }
      },
      update: (id: number) => {
        return { root: `/settings/provider-api-keys/${id}/update` }
      },
    },
    promocodes: {
      root: `/promocodes`,
      claim: {
        root: '/settings/promocodes/claim',
      },
    },
    integrations: {
      new: {
        root: '/settings/integrations/new',
      },
      destroy: (id: number) => {
        return { root: `/settings/integrations/${id}/destroy` }
      },
    },
    users: {
      destroy: (userId: string) => {
        return { root: `/settings/users/${userId}/destroy` }
      },
    },
  },
  notifications: {
    root: '/notifications',
  },
  dashboard: {
    root: '/dashboard',
    notifications: {
      root: '/dashboard/notifications',
    },
    projects: {
      new: {
        root: `/dashboard/projects/new`,
      },
      destroy: (id: number) => {
        return { root: `/dashboard/projects/${id}/destroy` }
      },
    },
  },
  datasets: {
    root: ({
      modal,
      name,
      parameters,
      backUrl,
    }: {
      modal?: IDatasetSettingsModal
      backUrl?: string
      name?: string
      parameters?: string
    } = {}) => {
      const root = '/datasets'
      const searchParams = new URLSearchParams()

      if (modal !== undefined) searchParams.set('modal', modal)
      if (backUrl !== undefined) searchParams.set('backUrl', backUrl)
      if (name !== undefined) searchParams.set('name', name)

      if (parameters !== undefined) searchParams.set('parameters', parameters)
      const query = searchParams.toString()
      return query ? `${root}?${query}` : root
    },
    detail: (id: string | number) => `/datasets/${id}`,
  },
  projects: {
    root: '/projects',
    detail: ({ id }: { id: number }) => {
      const root = `/projects/${id}`
      const rootCommits = `${root}/versions`
      return {
        root,
        commits: {
          root: rootCommits,
          latest: `${rootCommits}/${HEAD_COMMIT}`,
          detail: ({ uuid }: { uuid: string }) => {
            const root = `${rootCommits}/${uuid}`
            const rootDocuments = `${root}/documents`
            return {
              root,
              home: {
                root: `${root}/home`,
              },
              overview: {
                root: `${root}/overview`,
              },
              history: {
                root: `${root}/history`,
                detail: ({ uuid }: { uuid: string }) => ({
                  root: `${root}/history/${uuid}`,
                }),
              },
              documents: {
                root: rootDocuments,
                detail: ({ uuid }: { uuid: string }) => {
                  const root = `${rootDocuments}/${uuid}`
                  const rootEvaluations = `${root}/evaluations`
                  const experimentsRoot = `${root}/experiments`
                  const rootOptimizations = `${root}/optimizations`
                  return {
                    root,
                    [DocumentRoutes.editor]: {
                      root,
                    },
                    [DocumentRoutes.evaluations]: {
                      root: rootEvaluations,
                      detail: ({ uuid }: { uuid: string }) => {
                        const root = `${rootEvaluations}/${uuid}`
                        return {
                          root: root,
                          [EvaluationRoutes.editor]: {
                            root: `${root}/editor`,
                          },
                        }
                      },
                    },
                    [DocumentRoutes.logs]: {
                      root: `${root}/${DocumentRoutes.logs}`,
                      upload: `${root}/${DocumentRoutes.logs}/upload`,
                      withFilters: ({
                        experimentId,
                      }: {
                        experimentId?: number
                      }) => {
                        const base = `${root}/${DocumentRoutes.logs}`
                        if (experimentId) {
                          return `${base}?experimentId=${experimentId}`
                        }
                        return base
                      },
                    },
                    [DocumentRoutes.traces]: {
                      root: `${root}/${DocumentRoutes.traces}`,
                    },
                    [DocumentRoutes.experiments]: {
                      root: experimentsRoot,
                      withSelected: (uuids: (string | undefined)[]) => {
                        uuids = uuids.filter(Boolean) as string[]
                        if (!uuids.length) return experimentsRoot
                        return `${experimentsRoot}?selected=${uuids.join(',')}`
                      },
                    },
                    [DocumentRoutes.optimizations]: {
                      root: (params: Partial<Pagination> = {}) => {
                        const searchParams = new URLSearchParams()
                        for (const [key, value] of Object.entries(params)) {
                          searchParams.set(key, String(value))
                        }
                        if (!searchParams.size) return rootOptimizations
                        return `${rootOptimizations}?${searchParams.toString()}`
                      },
                      detail: ({
                        uuid,
                        ...params
                      }: Partial<Pagination> & {
                        uuid: string
                      }) => {
                        const searchParams = new URLSearchParams()
                        for (const [key, value] of Object.entries(params)) {
                          searchParams.set(key, String(value))
                        }
                        searchParams.set('optimizationUuid', uuid)
                        return {
                          root: `${rootOptimizations}?${searchParams.toString()}`,
                        }
                      },
                    },
                  }
                },
              },
              annotations: {
                root: (params?: {
                  activePage?: number
                  activePageSize?: number
                  sourceGroup?: string
                  completedPage?: number
                  completedPageSize?: number
                  realtime?: boolean
                }) => {
                  const base = `${root}/annotations`
                  if (!params) return base

                  const searchParams = new URLSearchParams()
                  if (params.activePage !== undefined) searchParams.set('activePage', String(params.activePage)) // prettier-ignore
                  if (params.activePageSize !== undefined) searchParams.set('activePageSize', String(params.activePageSize)) // prettier-ignore
                  if (params.sourceGroup !== undefined) searchParams.set('sourceGroup', params.sourceGroup) // prettier-ignore
                  if (params.completedPage !== undefined) searchParams.set('completedPage', String(params.completedPage)) // prettier-ignore
                  if (params.completedPageSize !== undefined) searchParams.set('completedPageSize', String(params.completedPageSize)) // prettier-ignore
                  if (params.realtime !== undefined) searchParams.set('realtime', String(params.realtime)) // prettier-ignore

                  const query = searchParams.toString()
                  return query ? `${base}?${query}` : base
                },
                detail: ({ uuid }: { uuid: string }) => ({
                  root: `${root}/annotations/${uuid}`,
                }),
              },
              issues: {
                root: `${root}/issues`,
              },
            }
          },
        },
      }
    },
  },
  auth: {
    setup: PUBLIC_ROOT_PATHS.setup,
    login: PUBLIC_ROOT_PATHS.login,
    magicLinkSent: (email: string) =>
      `${PUBLIC_ROOT_PATHS.magicLinks}/sent?email=${email}`,
    magicLinks: {
      confirm: (token: string) =>
        `${PUBLIC_ROOT_PATHS.magicLinks}/confirm/${token}`,
    },
  },
  share: {
    document: (publishedDocumentUuid: string) => {
      const shareDocRoot = `/share/d/${publishedDocumentUuid}`
      return {
        root: shareDocRoot,
        fork: `${shareDocRoot}/fork`,
        forked: ({
          projectId,
          documentUuid,
          commitUuid,
        }: {
          projectId: number
          documentUuid: string
          commitUuid: string
        }) => {
          return {
            root: `${shareDocRoot}/forked/${projectId}?documentUuid=${documentUuid}&commitUuid=${commitUuid}`,
          }
        },
      }
    },
  },
} as const
