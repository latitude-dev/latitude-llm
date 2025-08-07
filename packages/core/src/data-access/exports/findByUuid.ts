import { latitudeExports } from '../../schema/models/exports'
import { and, eq } from 'drizzle-orm'
import type { Export, Workspace } from '../../browser'
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
  return await db.query.latitudeExports.findFirst({
    where: and(eq(latitudeExports.uuid, uuid), eq(latitudeExports.workspaceId, workspace.id)),
  })
}
