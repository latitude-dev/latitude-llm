import {
  type AssignmentResult,
  createOrAssignIssueUseCase,
  type DiscoverIssueInput,
  type EligibilityResult,
  type RetrievalResult,
  recheckEligibilityUseCase,
  retrieveAndRerankUseCase,
  syncProjectionsUseCase,
} from "@domain/issues"
import { Effect } from "effect"

export const recheckEligibility = (input: DiscoverIssueInput, logFile?: string): Promise<EligibilityResult> =>
  Effect.runPromise(recheckEligibilityUseCase(input, logFile))

export const retrieveAndRerank = (input: DiscoverIssueInput, logFile?: string): Promise<RetrievalResult> =>
  Effect.runPromise(retrieveAndRerankUseCase(input, logFile))

export const createOrAssignIssue = (
  input: { readonly organizationId: string; readonly scoreId: string; readonly matchedIssueId: string | null },
  logFile?: string,
): Promise<AssignmentResult> => Effect.runPromise(createOrAssignIssueUseCase(input, logFile))

export const syncProjections = (
  input: { readonly organizationId: string; readonly issueId: string },
  logFile?: string,
): Promise<void> => Effect.runPromise(syncProjectionsUseCase(input, logFile))
