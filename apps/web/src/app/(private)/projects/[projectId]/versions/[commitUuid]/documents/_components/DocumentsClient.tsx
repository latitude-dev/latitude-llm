'use client'

import { useState } from 'react'

import { CodeBlock, Tabs, useCurrentProject } from '@latitude-data/web-ui'
import useApiKeys from '$/stores/apiKeys'

const tabs = [{ id: 'sdk', label: 'Javascript' }]

export function DocumentsClient() {
  const [activeTab, setActiveTab] = useState('sdk')
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
}: {
  apiKey: string | undefined
  projectId: number
}) {
  const sdkCode = `import { Latitude } from "@latitude-data/sdk";
  
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', {
  telemetry: {
    modules: {
      openAI: OpenAI // Check the documentation for the full list of supported providers
    }
  }
})

// Create a prompt in this project
const prompt = await sdk.prompts.getOrCreate('prompt-name', {
  projectId: ${projectId}
})


// Assign traces to the new prompt
sdk.telemetry.span({
  prompt: {
    uuid: prompt.uuid,
  }
}, async () => openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{
      role: "user",
      content: "Write a haiku about recursion in programming.",
    }]
}))
`

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}
