import type { PostgresClient } from "@platform/db-postgres"
import { isRuntimeAuthError } from "./runtime-postgres-role.ts"

export const createRuntimePostgresClient = ({
  createRuntimeClient,
  repairRuntimeAccess,
  onRepairAttempt,
}: {
  createRuntimeClient: () => PostgresClient
  repairRuntimeAccess: () => Promise<void>
  onRepairAttempt?: (error: unknown) => void
}): PostgresClient => {
  let runtimeClient = createRuntimeClient()
  let repairPromise: Promise<void> | null = null

  const runRepair = async (error: unknown) => {
    if (!repairPromise) {
      onRepairAttempt?.(error)
      repairPromise = (async () => {
        const previousClient = runtimeClient
        await repairRuntimeAccess()
        runtimeClient = createRuntimeClient()
        await previousClient.pool.end()
      })().finally(() => {
        repairPromise = null
      })
    }

    await repairPromise
  }

  return {
    get pool() {
      return runtimeClient.pool
    },
    get db() {
      return runtimeClient.db
    },
    transaction: async (fn) => {
      try {
        return await runtimeClient.transaction(fn)
      } catch (error) {
        if (!isRuntimeAuthError(error)) {
          throw error
        }

        await runRepair(error)
        return runtimeClient.transaction(fn)
      }
    },
  }
}
