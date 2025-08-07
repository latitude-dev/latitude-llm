import { Trigger } from '@latitude-data/constants/trigger'
import { Result } from '../../../../../lib/Result'
import { defineLatteTool } from '../types'

const listIntegrationTriggers = defineLatteTool(async () => {
  const latitudeTriggers: Trigger[] = [
    {
      name: 'Schedule',
      integrationName: 'Latitude',
    },
    {
      name: 'Email',
      integrationName: 'Latitude',
    },
  ]

  return Result.ok(latitudeTriggers)
})

export default listIntegrationTriggers
