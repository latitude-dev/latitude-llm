import { eq, getTableColumns } from 'drizzle-orm'

import { workspaceFeatures } from '../schema'
import { WorkspaceFeature } from '../browser'
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
