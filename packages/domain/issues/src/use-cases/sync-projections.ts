import { Effect } from "effect"

export const syncProjectionsUseCase = (_input: { readonly organizationId: string; readonly issueId: string }) =>
  Effect.sleep("500 millis")
