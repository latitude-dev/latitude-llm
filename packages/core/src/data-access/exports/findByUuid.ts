import { latitudeExports } from '../../schema/models/exports'
import { and, eq } from 'drizzle-orm'
import { Export, Workspace } from '../../schema/types'
import { database } from '../../client'

export async function findByUuid(
  {
    uuid,
    workspace,
  }: {
    uuid: string
    workspace: Workspace
  },
  db = database,
): Promise<Export | undefined> {
  return await db
    .select()
    .from(latitudeExports)
    .where(
      and(
        eq(latitudeExports.uuid, uuid),
        eq(latitudeExports.workspaceId, workspace.id),
      ),
    )
    .limit(1)
    .then((rows) => rows[0])
}
