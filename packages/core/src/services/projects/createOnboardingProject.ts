import { User, Workspace } from '../../browser'
import { Result } from '../../lib/Result'
import Transaction from '../../lib/Transaction'
import { createProject } from './create'
import { createNewDocument } from '../documents/create'
import { mergeCommit } from '../commits/merge'

/**
 * Creates an onboarding project with a single document containing a template for product descriptions
 */
export async function createOnboardingProject(
  {
    workspace,
    user,
  }: {
    workspace: Workspace
    user: User
  },
  transaction = new Transaction(),
) {
  // Create a project named "Onboarding"
  const { project, commit } = await createProject(
    {
      name: 'Onboarding',
      workspace,
      user,
    },
    transaction,
  ).then((r) => r.unwrap())

  // Create a document with the specified content
  const documentResult = await createNewDocument(
    {
      workspace,
      user,
      commit,
      path: 'onboarding',
      content: `---
provider: Latitude
model: gpt-4o-mini
---

Write a compelling product description for {{product_name}} with the following features:
{{features}}

The description should be appropriate for {{target_audience}} and highlight the main benefits.
Tone: {{tone}}
Length: {{word_count}} words`,
    },
    transaction,
  )
  if (documentResult.error) {
    return documentResult
  }

  // Merge the commit to finalize the document
  const mergedCommit = await mergeCommit(commit, transaction).then((r) =>
    r.unwrap(),
  )

  return Result.ok({
    project,
    documents: [documentResult.unwrap()],
    commit: mergedCommit,
  })
}
