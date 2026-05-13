import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"

export type BillingOverageWorkflowInput = {
  readonly organizationId: string
  readonly periodStart: string
  readonly periodEnd: string
  readonly snapshotOverageCredits: number
}

export type BillingOverageWorkflowResult = Awaited<ReturnType<typeof activities.reportBillingOverage>>

const { reportBillingOverage } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    maximumAttempts: 1,
  },
})

export const billingOverageWorkflow = async (
  input: BillingOverageWorkflowInput,
): Promise<BillingOverageWorkflowResult> => {
  return reportBillingOverage(input)
}
