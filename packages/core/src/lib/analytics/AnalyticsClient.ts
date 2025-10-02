import { users } from '../../schema/models/users'
import { eq } from 'drizzle-orm'

import { WorkspacesRepository } from '../../repositories'
import { database } from '../../client'
import { LatitudeEvent } from '../../events/events'
import {
  CollectorInput,
  DataCollector,
  ProductEdition,
} from './collectors/DataCollector'
import { CloudCollector } from './collectors/Cloud'
import { AnalyticsEnvironment } from './types'
import { OpenSourceCollector } from './collectors/OpenSource'
import { AnalyticsProvider } from './providers/AnalyticsProvider'

type CollectorEntities = {
  user: CollectorInput['user']
  workspace: CollectorInput['workspace']
}

export class AnalyticsClient {
  env: AnalyticsEnvironment
  event: LatitudeEvent
  collector: DataCollector<ProductEdition>
  provider: AnalyticsProvider

  constructor({
    env,
    provider,
    event,
  }: {
    env: AnalyticsEnvironment
    event: LatitudeEvent
    provider: AnalyticsProvider
  }) {
    this.env = env
    this.event = event
    this.provider = provider
    this.collector = env.isCloud
      ? new CloudCollector()
      : new OpenSourceCollector()
  }

  async capture() {
    const data = await this.collect()
    if (!data) return

    return this.provider.capture(data)
  }

  private async collect() {
    if (this.skipAnalytics) return
    if (!this.userEmail) return

    const data = await this.getData()
    if (!data) return

    return this.collector.collect({
      email: this.userEmail,
      user: data?.user,
      workspace: data?.workspace,
      event: this.event,
      analyticsEnv: this.env,
    })
  }

  private async getData(): Promise<CollectorEntities | undefined> {
    if (!this.userEmail) return undefined
    if (!this.workspaceId) return undefined

    const user = await this.getUser()
    if (!user) return undefined

    // TODO: remove, it's very expensive to have a read operation on each analytics event
    const repo = new WorkspacesRepository(user.id)
    const result = await repo.find(this.workspaceId)
    if (result.error) return undefined
    const workspace = result.value

    // Filtering out some expensive workspaces that are skewing our analytics...
    if (workspace.id === 13605) return undefined

    return {
      user: {
        id: user.id,
        email: user.email,
      },
      workspace: {
        id: workspace.id,
        uuid: workspace.uuid,
      },
    }
  }

  private async getUser() {
    if (!this.userEmail) return undefined

    const user = await database
      .select()
      .from(users)
      .where(eq(users.email, this.userEmail))
      .limit(1)
      .then((rows) => rows[0])
    if (!user) return undefined

    return { id: user.id, email: user.email }
  }

  private get userEmail() {
    return 'userEmail' in this.event.data
      ? this.event.data.userEmail
      : undefined
  }

  private get workspaceId() {
    return 'workspaceId' in this.event.data
      ? this.event.data.workspaceId
      : undefined
  }

  private get skipAnalytics() {
    if (this.env.isCloud) return false

    return this.env.optOutAnalytics
  }
}
