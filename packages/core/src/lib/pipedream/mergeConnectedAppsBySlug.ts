import {
  PipedreamIntegration,
  PipedreamIntegrationWithAcountCount,
} from '../../schema/types'

export function mergeConnectedAppsBySlug(
  connectedApps: PipedreamIntegration[],
): PipedreamIntegrationWithAcountCount[] {
  const appMap = new Map<
    string,
    { app: PipedreamIntegration; accountCount: number }
  >()

  for (const app of connectedApps) {
    const appName = app.configuration.appName
    const existing = appMap.get(appName)

    if (existing) {
      existing.accountCount += 1
    } else {
      appMap.set(appName, { app, accountCount: 1 })
    }
  }

  return Array.from(appMap.values()).map(({ app, accountCount }) => {
    return {
      ...app,
      accountCount,
    } satisfies PipedreamIntegrationWithAcountCount
  })
}
