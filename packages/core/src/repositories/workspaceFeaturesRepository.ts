import { eq, getTableColumns } from 'drizzle-orm'

import { WorkspaceFeature } from '../browser'
import { workspaceFeatures } from '../schema'
import Repository from './repositoryV2'

const tt = getTableColumns(workspaceFeatures)

export class WorkspaceFeaturesRepository extends Repository<WorkspaceFeature> {
  get scope() {
    return this.db
      .select(tt)
      .from(workspaceFeatures)
      .where(this.scopeFilter)
      .$dynamic()
  }

  get scopeFilter() {
    return eq(workspaceFeatures.workspaceId, this.workspaceId)
  }
}
