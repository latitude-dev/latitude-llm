import { isRedirect } from "@tanstack/react-router"

// Asserts `run` throws a TanStack `redirect(...)` and returns its nav options (`.options`).
export async function expectRedirect(run: () => Promise<unknown>): Promise<Record<string, unknown>> {
  try {
    await run()
  } catch (error) {
    if (isRedirect(error)) return (error as unknown as { options: Record<string, unknown> }).options
    throw error
  }
  throw new Error("Expected a redirect to be thrown, but the call resolved")
}
