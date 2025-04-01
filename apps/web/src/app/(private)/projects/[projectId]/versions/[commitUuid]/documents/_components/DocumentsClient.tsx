'use client'
import { useState } from 'react'

import useApiKeys from '$/stores/apiKeys'
import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Tabs } from '@latitude-data/web-ui/molecules/Tabs'
import { useCurrentProject } from '@latitude-data/web-ui/providers'
import { TabItem } from '@latitude-data/web-ui/molecules/Tabs'

const tabs: TabItem[] = [
  { id: 'javascript', label: 'Javascript' },
  { id: 'python', label: 'Python' },
]

export function DocumentsClient() {
  const [activeTab, setActiveTab] = useState(tabs[0]!.id)
  const { project } = useCurrentProject()
  const { data: apiKeys } = useApiKeys()

  return (
    <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
      {(activeTab) => (
        <>
          {activeTab === 'javascript' && (
            <JavascriptUsage
              apiKey={apiKeys[0]?.token}
              projectId={project.id}
            />
          )}
          {activeTab === 'python' && (
            <PythonUsage apiKey={apiKeys[0]?.token} projectId={project.id} />
          )}
        </>
      )}
    </Tabs>
  )
}

function JavascriptUsage({
  apiKey,
  projectId,
}: {
  apiKey: string | undefined
  projectId: number
}) {
  const sdkCode = `
import { Latitude } from '@latitude-data/sdk';

// Do not expose the API key in client-side code
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', {
  telemetry: {
    modules: {
      openAI: OpenAI, // Check the documentation for the full list of supported providers
    },
  },
})

// Create a prompt in this project
const prompt = await sdk.prompts.getOrCreate('prompt-name', {
  projectId: ${projectId},
})


// Assign traces to the new prompt
sdk.telemetry.span({
  prompt: {
    uuid: prompt.uuid,
  },
}, async () => openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [{
      role: 'user',
      content: 'Write a haiku about recursion in programming.',
    }],
}))
`.trim()

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}

function PythonUsage({
  apiKey,
  projectId,
}: {
  apiKey: string | undefined
  projectId: number
}) {
  const sdkCode = `
from latitude_sdk import Latitude, LatitudeOptions, GetOrCreatePromptOptions
from latitude_telemetry import Instrumentors, TelemetryOptions, SpanPrompt

# Do not expose the API key in client-side code
sdk = Latitude('${apiKey ?? 'YOUR_API_KEY'}', LatitudeOptions(
  telemetry=TelemetryOptions(
    instrumentors=[
      Instrumentors.OpenAI, # Check the documentation for the full list of supported providers
    ],
  ),
))

# Create a prompt in this project
prompt = await sdk.prompts.get_or_create('prompt-name', GetOrCreatePromptOptions(
  project_id=${projectId},
))

# Assign traces to the new prompt
with sdk.telemetry.span('span-name', prompt=SpanPrompt(uuid=prompt.uuid)):
  openai.chat.completions.create(
    model='gpt-4o-mini',
    messages=[{
      'role': 'user',
      'content': 'Write a haiku about recursion in programming.',
    }],
  )
`.trim()

  return <CodeBlock language='python'>{sdkCode}</CodeBlock>
}
