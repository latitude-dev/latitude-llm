'use client'
import { useState } from 'react'

import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Tabs } from '@latitude-data/web-ui/molecules/Tabs'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { TabItem } from '@latitude-data/web-ui/molecules/Tabs'
import { DocumentBlankSlateLayout } from '../../projects/[projectId]/versions/[commitUuid]/documents/_components/DocumentBlankSlateLayout'

const tabs: TabItem[] = [
  { id: 'javascript', label: 'Javascript' },
  { id: 'python', label: 'Python' },
]

export function TracesBlankSlate({ apiKey }: { apiKey: string | undefined }) {
  const [activeTab, setActiveTab] = useState(tabs[0]!.id)

  return (
    <DocumentBlankSlateLayout className='p-6'>
      <Text.H4M>Instrument your application with Latitude</Text.H4M>
      <Text.H5 color='foregroundMuted'>
        Add this code snippet to start streaming traces to Latitude.
      </Text.H5>
      <div className='bg-background'>
        <Tabs tabs={tabs} activeTab={activeTab} onChange={setActiveTab}>
          {(activeTab) => (
            <div className='p-6 bg-background rounded-lg flex flex-col gap-4 max-w-3xl'>
              {activeTab === 'javascript' && (
                <TracesJavascriptUsage apiKey={apiKey} />
              )}
              {activeTab === 'python' && <TracesPythonUsage apiKey={apiKey} />}
            </div>
          )}
        </Tabs>
      </div>
    </DocumentBlankSlateLayout>
  )
}

export function TracesJavascriptUsage({
  apiKey,
}: {
  apiKey: string | undefined
}) {
  const sdkCode = `
import { Latitude } from "@latitude-data/sdk";

// Do not expose the API key in client-side code
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', {
  telemetry: {
    modules: {
      openAI: OpenAI, // Check the documentation for the full list of supported providers
    },
  },
})
`.trim()

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}

export function TracesPythonUsage({ apiKey }: { apiKey: string | undefined }) {
  const sdkCode = `
from latitude_sdk import Latitude, LatitudeOptions
from latitude_telemetry import Instrumentors, TelemetryOptions

# Do not expose the API key in client-side code
sdk = Latitude('${apiKey ?? 'YOUR_API_KEY'}', LatitudeOptions(
  telemetry=TelemetryOptions(
    instrumentors=[
      Instrumentors.OpenAI, # Check the documentation for the full list of supported providers
    ],
  ),
))
`.trim()

  return <CodeBlock language='python'>{sdkCode}</CodeBlock>
}
