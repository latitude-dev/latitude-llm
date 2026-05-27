import { proxyActivities } from "@temporalio/workflow"
import type * as activities from "../activities/index.ts"
import { defaultActivityRetryPolicy } from "./retry-policy.ts"

export type TaxonomyNameClusterWorkflowInput = activities.NameTaxonomyClusterActivityInput
export type TaxonomyNameCategoryWorkflowInput = activities.NameTaxonomyCategoryActivityInput

export type TaxonomyNameClusterWorkflowResult = Awaited<ReturnType<typeof activities.nameTaxonomyClusterActivity>>
export type TaxonomyNameCategoryWorkflowResult = Awaited<ReturnType<typeof activities.nameTaxonomyCategoryActivity>>

const { nameTaxonomyClusterActivity, nameTaxonomyCategoryActivity } = proxyActivities<typeof activities>({
  startToCloseTimeout: "2 minutes",
  retry: {
    ...defaultActivityRetryPolicy,
    initialInterval: "1 minute",
    maximumInterval: "30 minutes",
  },
})

export const taxonomyNameClusterWorkflow = async (
  input: TaxonomyNameClusterWorkflowInput,
): Promise<TaxonomyNameClusterWorkflowResult> => nameTaxonomyClusterActivity(input)

export const taxonomyNameCategoryWorkflow = async (
  input: TaxonomyNameCategoryWorkflowInput,
): Promise<TaxonomyNameCategoryWorkflowResult> => nameTaxonomyCategoryActivity(input)
