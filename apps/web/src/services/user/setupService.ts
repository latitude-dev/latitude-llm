import {
  createUser,
  createWorkspace,
  PromisedResult,
  Result,
  SessionData,
  Transaction,
} from '@latitude-data/core'

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
  return Transaction.call(async (tx) => {
    const userResult = await createUser({ email, password, name }, tx)

    if (userResult.error) return userResult

    const user = userResult.value
    const result = await createWorkspace(
      {
        name: companyName,
        user,
      },
      tx,
    )

    if (result.error) return result

    const workspace = result.value

    return Result.ok({
      user,
      workspace: { id: Number(workspace.id), name: workspace.name },
    })
  })
}
