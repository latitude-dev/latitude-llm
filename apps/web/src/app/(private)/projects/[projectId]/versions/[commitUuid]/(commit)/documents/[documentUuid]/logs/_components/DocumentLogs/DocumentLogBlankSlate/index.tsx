import { Commit, DocumentVersion, Project } from '@latitude-data/core/browser'
import { Button, CodeBlock, Text } from '@latitude-data/web-ui'
import { ROUTES } from '$/services/routes'
import Link from 'next/link'

import { DocumentBlankSlateLayout } from '../../../../../_components/DocumentBlankSlateLayout'
import { getApiKeysCached } from '$/app/(private)/_data-access'

export async function DocumentLogBlankSlate({
  commit,
  project,
  document,
}: {
  commit: Commit
  project: Project
  document: DocumentVersion
}) {
  const apiKeys = await getApiKeysCached()
  return (
    <DocumentBlankSlateLayout>
      <div className='flex flex-col gap-4 items-center'>
        <Text.H4M>Getting started</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          There are no logs for this prompt yet. To start follow one of these
          steps:
        </Text.H5>
      </div>
      <Link
        href={
          ROUTES.projects
            .detail({ id: project.id })
            .commits.detail({ uuid: commit.uuid })
            .documents.detail({ uuid: document.documentUuid }).logs.upload
        }
      >
        <Button fullWidth fancy variant='outline'>
          <div className='flex flex-col gap-1 p-4'>
            <Text.H4M>Import logs from UI</Text.H4M>
            <Text.H5 color='foregroundMuted'>
              If you run prompts outside of Latitude, you can upload your logs
              in order to evaluate them.
            </Text.H5>
          </div>
        </Button>
      </Link>
      <Text.H5 color='foregroundMuted'>Or</Text.H5>
      <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
        <Text.H4M>Import logs from code</Text.H4M>
        <Text.H5 color='foregroundMuted'>
          Wrap your generation requests with the following code snippet. Once
          done, come back to this page, and you'll be able to evaluate both
          existing and incoming logs.
        </Text.H5>
        <JavascriptUsage
          apiKey={apiKeys[0]?.token}
          project={project}
          commit={commit}
          document={document}
        />
      </div>
    </DocumentBlankSlateLayout>
  )
}

function JavascriptUsage({
  apiKey,
  project,
  commit,
  document,
}: {
  apiKey: string | undefined
  project: Project
  commit: Commit
  document: DocumentVersion
}) {
  const sdkCode = `import { Latitude } from "@latitude-data/sdk";

// Latitude's API Key is a secret, do not expose it in client-side code
const latitude = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { 
  projectId: ${project.id},
  telemetry: {
    modules: {
      openAI: OpenAI, // Check the documentation to get a list of supported modules
    }
  }
})

// Any LLM generation within the span will generate a log for this prompt
latiude.telemetry.span({ 
  prompt: { 
    path: '${document.path}', 
    versionUuid: '${commit.uuid}'
  } 
}, async () => await openai.chat.completions.create({ ... }))
`

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}
