import { HEAD_COMMIT } from '@latitude-data/core/browser'

export enum DocumentRoutes {
  editor = 'editor',
  logs = 'logs',
  evaluations = 'evaluations',
}

export enum EvaluationRoutes {
  dashboard = 'dashboard',
  editor = 'editor',
}

export const ROUTES = {
  root: '/',
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
  },
  evaluations: {
    root: '/evaluations',
    detail: ({ uuid }: { uuid: string }) => {
      const root = `${ROUTES.evaluations.root}/${uuid}`
      return {
        root,
        [EvaluationRoutes.dashboard]: {
          root: `${root}/dashboard`,
          destroy: { root: `${root}/dashboard/destroy` },
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
                  const rootEvaluations = `${root}/evaluations`
                  return {
                    root,
                    [DocumentRoutes.editor]: { root },
                    [DocumentRoutes.evaluations]: {
                      root: rootEvaluations,
                      connect: {
                        root: `${rootEvaluations}/connect`,
                      },
                      detail: ({ uuid }: { uuid: string }) => {
                        const root = `${rootEvaluations}/${uuid}`
                        return {
                          root,
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
} as const
