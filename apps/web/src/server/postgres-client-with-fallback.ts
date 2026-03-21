import type { PostgresClient } from "@platform/db-postgres"

export const isRuntimeAuthError = (error: unknown) => {
  if (!(error instanceof Error)) {
    return false
  }

  const message = error.message.toLowerCase()

  if (message.includes("password authentication failed") || message.includes("no pg_hba.conf entry")) {
    return true
  }

  return message.includes("role") && message.includes("does not exist")
}

export const createPostgresClientWithFallback = ({
  runtimeClient,
  adminClient,
  onFallback,
}: {
  runtimeClient: PostgresClient
  adminClient: PostgresClient
  onFallback?: (error: unknown) => void
}): PostgresClient => {
  let useAdminClient = false

  return {
    pool: runtimeClient.pool,
    db: runtimeClient.db,
    transaction: async (fn) => {
      if (useAdminClient) {
        return adminClient.transaction(fn)
      }

      try {
        return await runtimeClient.transaction(fn)
      } catch (error) {
        if (!isRuntimeAuthError(error)) {
          throw error
        }

        useAdminClient = true
        onFallback?.(error)
        return adminClient.transaction(fn)
      }
    },
  }
}
