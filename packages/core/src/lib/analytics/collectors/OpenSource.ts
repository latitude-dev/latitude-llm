import { DataCollector, type CollectorInput, type CollectorOutput } from './DataCollector'

export class OpenSourceCollector extends DataCollector<'oss'> {
  collect(args: CollectorInput): CollectorOutput<'oss'> | undefined {
    const { user, workspace, event, analyticsEnv } = args

    if (!workspace || !user) return undefined

    return {
      distinctId: `user_${user.id}@workspace_${workspace.uuid}`,
      event: event.type,
      disableGeoip: true,
      properties: {
        productEdition: 'oss',
        workspaceId: workspace.id,
        workspaceUuid: workspace.uuid,
        appDomain: analyticsEnv.appDomain,
        data: Object.keys(event.data).reduce(
          (acc, key) => {
            acc[key] = '[REDACTED]'
            return acc
          },
          {} as Record<string, string>,
        ),
      },
    }
  }
}
