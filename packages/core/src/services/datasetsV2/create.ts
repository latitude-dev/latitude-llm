import { User, Workspace } from '../../browser'
import { Column } from '../../schema/models/datasetsV2'
import { database } from '../../client'
import {
  BadRequestError,
  databaseErrorCodes,
  Result,
  Transaction,
} from '../../lib'
import { datasetsV2 } from '../../schema'
import { DatabaseError } from 'pg'

export const createDataset = async (
  {
    author,
    workspace,
    data,
  }: {
    author: User
    workspace: Workspace
    data: {
      name: string
      columns: Column[]
    }
  },
  db = database,
) => {
  return Transaction.call(async (trx) => {
    try {
      const inserts = await trx
        .insert(datasetsV2)
        .values({
          name: data.name,
          workspaceId: workspace.id,
          authorId: author.id,
          columns: data.columns,
        })
        .returning()

      const dataset = inserts[0]!

      return Result.ok({
        ...dataset,
        author: {
          id: author.id,
          name: author.name,
        },
      })
    } catch (error) {
      if (error instanceof DatabaseError) {
        if (error.code === databaseErrorCodes.uniqueViolation) {
          if (error.constraint?.includes('name')) {
            throw new BadRequestError('A dataset with this name already exists')
          }
        }
      }

      throw error
    }
  }, db)
}
