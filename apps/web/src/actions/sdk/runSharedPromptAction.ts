'use server'
import { publisher } from '@latitude-data/core/events/publisher'
import { type ChainEventDto } from '@latitude-data/sdk'
import { createSdk } from '$/app/(private)/_lib/createSdk'
import { findSharedDocumentCached } from '$/app/(public)/_data_access'
import { createStreamableValue } from '@ai-sdk/rsc'
import { LogSources, StreamEventTypes } from '@latitude-data/core/constants'

type RunSharedPromptActionProps = {
  publishedDocumentUuid: string
  parameters: Record<string, unknown>
}

export async function runSharedPromptAction({
  publishedDocumentUuid,
  parameters,
}: RunSharedPromptActionProps) {
  const stream = createStreamableValue<
    { event: StreamEventTypes; data: ChainEventDto },
    Error
  >()
  const result = await findSharedDocumentCached(publishedDocumentUuid)

  if (result.error) {
    throw result.error
  }

  const { workspace, shared, document, commit } = result.value
  const projectId = shared.projectId
  const documentPath = document.path
  const commitUuid = commit.uuid

  publisher.publishLater({
    type: 'publicDocumentRunRequested',
    data: {
      workspaceId: workspace.id,
      commitUuid,
      isLiveCommit: true, // Shared prompts always run on the live commit
      projectId,
      documentPath,
      publishedDocumentUuid,
      parameters,
    },
  })

  const sdk = await createSdk({
    workspace,
    projectId,
    __internal: { source: LogSources.SharedPrompt },
  }).then((r) => r.unwrap())
  const response = sdk.prompts.run(documentPath, {
    stream: true,
    background: false,
    versionUuid: commitUuid,
    parameters,
    onEvent: (event) => {
      stream.update(event)
    },
    onError: (error) => {
      stream.error({
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
    },
    onFinished: () => {
      stream.done()
    },
  })

  return {
    output: stream.value,
    response,
  }
}
