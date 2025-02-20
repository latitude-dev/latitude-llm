import { CodeBlock, Text } from '@latitude-data/web-ui'
import { UsedToolsDoc } from '../index'

export function APIUsage({
  projectId,
  commitUuid,
  documentPath,
  apiKey,
  parameters,
  tools,
}: {
  projectId: number
  commitUuid: string
  documentPath: string
  apiKey: string | undefined
  parameters: Set<string>
  tools: UsedToolsDoc[]
}) {
  const getRequestBodyContent = () => {
    const body = {
      path: documentPath,
      stream: false,
    } as Record<string, unknown>

    if (parameters.size > 0) {
      body['parameters'] = Array.from(parameters).reduce(
        (acc, param) => ({ ...acc, [param]: '' }),
        {},
      )
    }

    return JSON.stringify(body, null, 2)
      .split('\n')
      .map((line) => `    ${line}`)
      .join('\n')
  }

  const apiCode = `
curl -X POST \\
  https://gateway.latitude.so/api/v3/projects/${projectId}/versions/${commitUuid}/documents/run \\
  -H 'Authorization: Bearer ${apiKey ?? 'YOUR_API_KEY'}' \\
  -H 'Content-Type: application/json' \\
  -d '
${getRequestBodyContent()}
  '
`

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5>
        To run this document programmatically, execute the following command:
      </Text.H5>
      <CodeBlock language='bash'>{apiCode.trim()}</CodeBlock>
      {tools.length > 0 && (
        <Text.H5>
          You have defined {tools.length} tools in this document. The
          conversation will stop when assistant messages with tool call content
          are received. You can continue the conversation by returning the tools
          results in the chat endpoint.
        </Text.H5>
      )}
      <Text.H5>
        Check out{' '}
        <a
          target='_blank'
          href='https://docs.latitude.so/guides/api/api-access'
        >
          <Text.H5 underline color='primary'>
            our docs
          </Text.H5>
        </a>{' '}
        for more details.
      </Text.H5>
    </div>
  )
}
