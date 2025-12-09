import { env } from '@latitude-data/env'

/**
 * Creates a full link by prepending the APP_URL to the given path.
 */
export function createLink(path: string) {
  return `${env.APP_URL}/${path}`
}

export const EMAIL_ROUTES = {
  notifications: (workspaceId: number) => {
    const notificationsPath = createLink(
      `dashboard/notifications/${workspaceId}`,
    )
    return {
      root: notificationsPath,
    }
  },
  projects: {
    details: (projectId: number) => {
      const projectPath = createLink(`projects/${projectId}`)
      return {
        root: projectPath,
        commits: {
          details: (commitUuid: string = 'live') => {
            const commitPath = `${projectPath}/versions/${commitUuid}`
            const issuesPath = `${commitPath}/issues`
            const annotationsPath = `${commitPath}/annotations`
            return {
              root: commitPath,
              issues: {
                root: issuesPath,
                details: (issueId: number) => {
                  return `${issuesPath}?issueId=${issueId}`
                },
              },
              annotations: {
                root: annotationsPath,
              },
            }
          },
        },
      }
    },
  },
}
