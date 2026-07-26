import { isServer, MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query"
import type { ReactNode } from "react"
import { parseServerError } from "../errors.ts"
import { STALE_SERVER_FN_ERROR_TAG } from "../stale-server-fn.ts"
import { handleMutationError } from "./handle-mutation-error.ts"

const reloadOnStaleServerFn = (error: unknown): void => {
  if (parseServerError(error)._tag !== STALE_SERVER_FN_ERROR_TAG) return
  if (typeof window !== "undefined") window.location.reload()
}

const makeQueryClient = () =>
  new QueryClient({
    queryCache: new QueryCache({
      onError: (error) => {
        reloadOnStaleServerFn(error)
      },
    }),
    mutationCache: new MutationCache({
      onError: (error, _variables, _context, mutation) => {
        // opt-in: most callers already surface errors (mutateAsync+catch, form handlers)
        const meta = mutation.options.meta as Record<string, unknown> | undefined
        handleMutationError(error, { toastGenericError: meta?.globalErrorToast === true })
      },
    }),
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        retry: 1,
      },
    },
  })

let browserQueryClient: QueryClient | undefined

export const getQueryClient = () => {
  if (isServer) {
    return makeQueryClient()
  }

  browserQueryClient ??= makeQueryClient()
  return browserQueryClient
}

export const AppQueryProvider = ({ children }: { children: ReactNode }) => {
  const queryClient = getQueryClient()

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
}
