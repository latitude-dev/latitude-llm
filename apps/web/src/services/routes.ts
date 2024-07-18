import { HEAD_COMMIT } from '@latitude-data/core'

const ROOT_PATH = '/'
const PROJECTS_PATH = `${ROOT_PATH}projects`

export const ROUTES = {
  root: ROOT_PATH,
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
          detail: ({ id }: { id: number }) => `${rootCommits}/${id}`,
        },
      }
    },
  },
  auth: {
    setup: '/setup',
    login: '/login',
  },
} as const
