import {
  createUser,
  createWorkspace,
  Result,
  SessionData,
  Transaction,
} from '@latitude-data/core'
import db from '$/db/database'
import { PromisedResult } from '$core/lib/Transaction'

export default function setupService({
  email,
  password,
  name,
  companyName,
}: {
  email: string
  password: string
  name: string
  companyName: string
}): PromisedResult<SessionData> {
  return Transaction.call(db, async (trx) => {
    const userResult = await createUser({ db: trx, email, password, name })

    if (userResult.error) return userResult

    const result = await createWorkspace({
      db: trx,
      name: companyName,
      creatorId: userResult.value.id,
    })

    if (result.error) return result

    const workspace = result.value

    return Result.ok({
      user: userResult.value,
      workspace: { id: Number(workspace.id), name: workspace.name },
    })
  })
}
