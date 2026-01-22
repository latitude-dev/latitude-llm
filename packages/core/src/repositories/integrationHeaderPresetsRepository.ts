import { and, eq, getTableColumns } from 'drizzle-orm'

import { IntegrationHeaderPreset } from '../schema/models/types/IntegrationHeaderPreset'
import { Result } from '../lib/Result'
import { integrationHeaderPresets } from '../schema/models/integrationHeaderPresets'
import Repository from './repositoryV2'

const tt = getTableColumns(integrationHeaderPresets)

export class IntegrationHeaderPresetsRepository extends Repository<IntegrationHeaderPreset> {
  get scopeFilter() {
    return eq(integrationHeaderPresets.workspaceId, this.workspaceId)
  }

  get scope() {
    return this.db
      .select(tt)
      .from(integrationHeaderPresets)
      .where(this.scopeFilter)
      .$dynamic()
  }

  async findByIntegration(integrationId: number) {
    const result = await this.scope.where(
      and(
        eq(integrationHeaderPresets.integrationId, integrationId),
        this.scopeFilter,
      ),
    )

    return Result.ok(result as IntegrationHeaderPreset[])
  }
}
