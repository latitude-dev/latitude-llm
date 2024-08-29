import { HEAD_COMMIT } from '@latitude-data/core/browser'

const ROOT_PATH = '/'
const PROJECTS_PATH = `${ROOT_PATH}projects`

export enum DocumentRoutes {
  editor = 'editor',
  logs = 'logs',
}

// TODO: Move to core
export const ROUTES = {
  root: ROOT_PATH,
  settings: {
    root: '/settings',
  },
  projects: {
    root: PROJECTS_PATH,
    detail: ({ id }: { id: number }) => {
      const root = `${PROJECTS_PATH}/${id}`
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
                  return {
                    root: `${root}`,
                    [DocumentRoutes.editor]: {
                      root: `${root}`,
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
