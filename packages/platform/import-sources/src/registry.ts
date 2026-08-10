import type { ImportSourceAdapterRegistry } from "@domain/imports"
import { createBraintrustAdapter } from "./braintrust/adapter.ts"
import { createLangfuseAdapter } from "./langfuse/adapter.ts"
import { createLangsmithAdapter } from "./langsmith/adapter.ts"

export const createImportAdapterRegistry = (): ImportSourceAdapterRegistry => ({
  langfuse: createLangfuseAdapter(),
  langsmith: createLangsmithAdapter(),
  braintrust: createBraintrustAdapter(),
})

export { createBraintrustAdapter } from "./braintrust/adapter.ts"
export { createLangfuseAdapter } from "./langfuse/adapter.ts"
export { createLangsmithAdapter } from "./langsmith/adapter.ts"
