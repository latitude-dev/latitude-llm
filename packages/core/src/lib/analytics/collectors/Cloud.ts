import debug from '../../debug'
import {
  DataCollector,
  type CollectorInput,
  type CollectorOutput,
} from './DataCollector'

export class CloudCollector extends DataCollector<'cloud'> {
  collect(args: CollectorInput): CollectorOutput<'cloud'> | undefined {
    const { email, workspace, event, analyticsEnv } = args

    const data = {
      distinctId: email,
      event: event.type,
      disableGeoip: true,
      properties: {
        productEdition: 'cloud',
        appDomain: analyticsEnv.appDomain,
        workspaceId: workspace?.id,
        workspaceUuid: workspace?.uuid,
        data: event.data,
      },
    } satisfies CollectorOutput<'cloud'>

    if (analyticsEnv.nodeEnv === 'development') {
      debug('Analytics event captured:', JSON.stringify(data, null, 2))
      return
    }

    return data
  }
}
