import { HEAD_COMMIT } from '@latitude-data/core/browser'

import { _API_ROUTES } from './routes/api'

export enum DocumentRoutes {
  editor = 'editor',
  logs = 'logs',
  evaluations = 'evaluations',
}

export enum EvaluationRoutes {
  dashboard = 'dashboard',
  editor = 'editor',
}

export enum BackofficeRoutes {
  templates = 'templates',
  rewards = 'rewards',
}

export const ROUTES = {
  root: '/',
  backoffice: {
    root: '/backoffice',
    [BackofficeRoutes.templates]: {
      root: '/backoffice/templates',
    },
    [BackofficeRoutes.rewards]: {
      root: '/backoffice/rewards',
    },
  },
  api: _API_ROUTES,
  settings: {
    root: '/settings',
    providerApiKeys: {
      destroy: (id: number) => {
        return { root: `/settings/apikeys/${id}/destroy` }
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
    root: '/datasets',
    new: {
      root: `/datasets/new`,
    },
    generate: {
      root: `/datasets/generate`,
    },
    preview: (id: string | number) => `/datasets/preview/${id}`,
  },
  evaluations: {
    root: '/evaluations',
    destroy: (uuid: string) => `${ROUTES.evaluations.root}/${uuid}/destroy`,
    detail: ({ uuid }: { uuid: string }) => {
      const root = `${ROUTES.evaluations.root}/${uuid}`
      return {
        root,
        [EvaluationRoutes.dashboard]: {
          root: `${root}/dashboard`,
        },
        [EvaluationRoutes.editor]: {
          root: `${root}/editor`,
          importLogs: {
            root: `${root}/editor/import-logs`,
          },
        },
      }
    },
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
              documents: {
                root: rootDocuments,
                detail: ({ uuid }: { uuid: string }) => {
                  const root = `${rootDocuments}/${uuid}`
                  const evaluationsRoot: string = `${root}/evaluations`
                  return {
                    root,
                    [DocumentRoutes.editor]: { root },
                    [DocumentRoutes.evaluations]: {
                      root: evaluationsRoot,
                      dashboard: {
                        root: `${evaluationsRoot}/dashboard`,
                        connect: {
                          root: `${evaluationsRoot}/dashboard/connect`,
                        },
                        destroy: (id: number) =>
                          `${evaluationsRoot}/destroy/${id}`,
                      },
                      detail: (id: number) => {
                        const detailRoot = `${evaluationsRoot}/${id}`
                        return {
                          root: detailRoot,
                          createBatch: `${detailRoot}/create-batch`,
                        }
                      },
                    },
                    [DocumentRoutes.logs]: {
                      root: `${root}/${DocumentRoutes.logs}`,
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
    setup: '/setup',
    login: '/login',
    magicLinkSent: (email: string) => `/magic-links/sent?email=${email}`,
    magicLinks: {
      confirm: (token: string) => `/magic-links/confirm/${token}`,
    },
  },
  public: {
    errorTest: '/error-test',
  },
} as const
