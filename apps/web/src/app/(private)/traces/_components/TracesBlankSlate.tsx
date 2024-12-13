import { CodeBlock, Text } from '@latitude-data/web-ui'
import { DocumentBlankSlateLayout } from '../../projects/[projectId]/versions/[commitUuid]/documents/_components/DocumentBlankSlateLayout'

export function TracesBlankSlate({ apiKey }: { apiKey: string | undefined }) {
  return (
    <DocumentBlankSlateLayout className='p-6'>
      <Text.H4M>Instrument your application with Latitude</Text.H4M>
      <Text.H5 color='foregroundMuted'>
        Add this code snippet to start streaming traces to Latitude.
      </Text.H5>
      <div className='p-6 bg-background border rounded-lg flex flex-col gap-4 max-w-3xl'>
        <TracesJavascriptUsage apiKey={apiKey} />
      </div>
    </DocumentBlankSlateLayout>
  )
}

export function TracesJavascriptUsage({
  apiKey,
}: {
  apiKey: string | undefined
}) {
  const sdkCode = `import { Latitude } from "@latitude-data/sdk";

// Latitude's API Key is a secret, do not expose it in client-side code
const latitude = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { 
  telemetry: {
    modules: {
      openAI: OpenAI, // Check the documentation to get a list of supported modules
    }
  }
})
`

  return <CodeBlock language='javascript'>{sdkCode}</CodeBlock>
}
