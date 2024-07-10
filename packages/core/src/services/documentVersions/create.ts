import {
  database,
  documentVersions,
  findCommit,
  Result,
  type DocumentType,
} from '@latitude-data/core'

import createCommit from '../commits/create'

export async function createDocumentVersion({
  name,
  commitUuid,
  documentType,
  parentId,
}: {
  name: string
  commitUuid: string
  documentType?: DocumentType
  parentId?: number
}) {
  const data = { name, parentId, documentType }

  return database.transaction(async (tx) => {
    const foundCommit = await findCommit({ uuid: commitUuid })
    if (foundCommit) {
      try {
        return Result.ok(
          (
            await tx
              .insert(documentVersions)
              .values({
                ...data,
                commitId: foundCommit.id,
              })
              .returning()
          )[0],
        )
      } catch (err) {
        return Result.error(err as Error)
      }
    }

    const res = await createCommit(tx)
    if (!res.ok) return res

    try {
      return Result.ok(
        (
          await tx
            .insert(documentVersions)
            .values({
              ...data,
              commitId: res.unwrap()!.id,
            })
            .returning()
        )[0],
      )
    } catch (err) {
      return Result.error(err as Error)
    }
  })
}
