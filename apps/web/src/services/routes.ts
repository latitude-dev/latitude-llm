import { HEAD_COMMIT } from '@latitude-data/core/browser'

import { API_ROUTES } from './routes/api'
import { PUBLIC_ROOT_PATHS } from '$/services/auth/constants'

export type IDatasetSettingsModal = 'new' | 'generate'

export enum DocumentRoutes {
  editor = 'editor',
  logs = 'logs',
  evaluations = 'evaluations',
  experiments = 'experiments',
}

export enum EvaluationRoutes {
  editor = 'editor',
}

export enum BackofficeRoutes {
  templates = 'templates',
  rewards = 'rewards',
  users = 'users',
  usageOverview = 'usageOverview',
  triggers = 'triggers',
}

const BACKOFFICE_ROOT = '/backoffice'

export const ROUTES = {
  root: '/',
  api: API_ROUTES,
  onboarding: {
    root: '/onboarding',
  },
  backoffice: {
    root: BACKOFFICE_ROOT,
    [BackofficeRoutes.templates]: {
      root: `${BACKOFFICE_ROOT}/templates`,
    },
    [BackofficeRoutes.rewards]: {
      root: `${BACKOFFICE_ROOT}/rewards`,
    },
    [BackofficeRoutes.users]: {
      root: `${BACKOFFICE_ROOT}/users`,
    },
    [BackofficeRoutes.usageOverview]: {
      root: `${BACKOFFICE_ROOT}/usage-overview`,
    },
    [BackofficeRoutes.triggers]: {
      root: `${BACKOFFICE_ROOT}/triggers`,
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
    },
    integrations: {
      new: {
        root: '/settings/integrations/new',
      },
      destroy: (id: number) => {
        return { root: `/settings/integrations/${id}/destroy` }
      },
      details: (id: number) => {
        return { root: `/settings/integrations/${id}/details` }
      },
    },
    users: {
      destroy: (userId: string) => {
        return { root: `/settings/users/${userId}/destroy` }
      },
    },
  },
  dashboard: {
    root: '/dashboard',
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
                    [DocumentRoutes.experiments]: {
                      root: experimentsRoot,
                      withSelected: (uuids: string[]) => {
                        if (!uuids.length) return experimentsRoot
                        return `${experimentsRoot}?selected=${uuids.join(',')}`
                      },
                    },
                  }
                },
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
