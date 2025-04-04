import { LatitudeEvent } from './events'
import { eventsQueue, webhooksQueue } from '../jobs/queues'

export const publisher = {
  publishLater: async (event: LatitudeEvent) => {
    eventsQueue.add('createEventJob', event)
    eventsQueue.add('publishEventJob', event)
    eventsQueue.add('publishToAnalyticsJob', event)

    webhooksQueue.add('processWebhookJob', event)
  },
}
