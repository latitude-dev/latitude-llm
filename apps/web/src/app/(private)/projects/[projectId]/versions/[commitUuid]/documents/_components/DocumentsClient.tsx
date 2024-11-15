'use client'

import { useState } from 'react'

import { DocumentVersion } from '@latitude-data/core/browser'
import {
  CodeBlock,
  Tabs,
  Text,
  useCurrentCommit,
  useCurrentProject,
} from '@latitude-data/web-ui'
import useApiKeys from '$/stores/apiKeys'

const tabs = [
  { id: 'sdk', label: 'Javascript' },
  { id: 'api', label: 'HTTP API' },
]

export function DocumentsClient({ document }: { document?: DocumentVersion }) {
  const [activeTab, setActiveTab] = useState('sdk')
  const { commit } = useCurrentCommit()
  const { project } = useCurrentProject()
  const { data: apiKeys } = useApiKeys()

  return (
    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
      {(activeTab) => (
        <>
          {activeTab === 'sdk' && (
            <JavascriptUsage
              apiKey={apiKeys[0]?.token}
              projectId={project.id}
              document={document}
            />
          )}
          {activeTab === 'api' && (
            <APIUsage
              apiKey={apiKeys[0]?.token}
              projectId={project.id}
              commitUuid={commit.uuid}
            />
          )}
        </>
      )}
    </Tabs>
  )
}

function JavascriptUsage({
  apiKey,
  projectId,
  document,
}: {
  apiKey: string | undefined
  projectId: number
  document?: DocumentVersion
}) {
  const sdkCode = `import { Latitude } from "@latitude-data/sdk";
  
// Initialize the SDK
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { projectId: ${projectId} })

// Call your AI provider
const messages = [
    { role: "system", content: "You are a helpful assistant." },
    {
        role: "user",
        content: "Write a haiku about recursion in programming.",
    },
]
const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages
});

// Log the response to Latitude
${
  document
    ? `sdk.logs.create('${document.path}', [...messages, ...completion.choices])`
    : `const prompt = await sdk.prompts.getOrCreate('my-prompt-path')
sdk.logs.create(prompt.path, [...messages, ...completion.choices])`
}`

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}

function APIUsage({
  apiKey,
  projectId,
  commitUuid,
}: {
  apiKey: string | undefined
  projectId: number
  commitUuid: string
}) {
  const createPromptCode = `curl -X POST https://gateway.latitude.so/v2/projects/${projectId}/versions/${commitUuid}/documents/getOrCreate \n\
  -H "Authorization: Bearer ${apiKey}" \n\
  -H "Content-Type: application/json" \n\
  -d '{"path": "my-prompt-path"}'`

  const logResponseCode = `curl -X POST https://gateway.latitude.so/v2/projects/${projectId}/versions/${commitUuid}/documents/logs \n\
  -H "Authorization: Bearer ${apiKey}" \n\
  -H "Content-Type: application/json" \n\
  -d '{"path": "my-prompt-path", "messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": "Write a haiku about recursion in programming."}, { "role": "assistant", "content": "A function that calls itself is called a recursive function." }]'`

  return (
    <div className='flex flex-col gap-4 p-6'>
      <Text.H5>First, create the prompt:</Text.H5>
      <CodeBlock language='bash'>{createPromptCode}</CodeBlock>
      <Text.H5>Then, log the response after calling your AI provider:</Text.H5>
      <CodeBlock language='bash'>{logResponseCode}</CodeBlock>
    </div>
  )
}
