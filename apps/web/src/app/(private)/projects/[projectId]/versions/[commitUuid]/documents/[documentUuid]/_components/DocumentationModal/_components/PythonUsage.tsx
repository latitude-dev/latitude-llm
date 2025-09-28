import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { UsedToolsDoc } from '../index'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

export function PythonUsage({
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
  const getParametersString = () => {
    if (parameters.size === 0) return ''

    const entries = Array.from(parameters).map((key) => `\t\t'${key}': ''`)

    return `\tparameters={\n${entries.join(',\n')}\n\t}`
  }

  const getToolsString = () => {
    if (tools.length === 0) return ''

    const entries = tools.map(
      (tool) =>
        `\t\t'${tool.name}': # async def ${tool.name}(arguments: Dict[str, Any], details: OnToolCallDetails) -> Any`,
    )

    return `\ttools={\n${entries.join('\n')}\n\t}`
  }

  const getRunOptions = () => {
    const options = []

    if (commitUuid !== HEAD_COMMIT) {
      options.push(`\tversion_uuid='${commitUuid}'`)
    }

    const parametersString = getParametersString()
    if (parametersString) {
      options.push(parametersString)
    }

    const toolsString = getToolsString()
    if (toolsString) {
      options.push(toolsString)
    }

    return options.length > 0
      ? `, RunPromptOptions(\n${options.join(',\n')}\n)`
      : ''
  }

  const sdkCode = `from latitude_sdk import Latitude, LatitudeOptions, RunPromptOptions

# Do not expose the API key in client-side code
sdk = Latitude('${apiKey ?? 'YOUR_API_KEY'}', LatitudeOptions(project_id=${projectId}))

result = await sdk.prompts.run('${documentPath}'${getRunOptions()})
`

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5>
        First, to run this document programmatically, install the SDK:
      </Text.H5>
      <CodeBlock language='bash'>pip install latitude-sdk</CodeBlock>
      <Text.H5>Then, use the following code to run the document:</Text.H5>
      <CodeBlock language='python'>{sdkCode}</CodeBlock>
      <Text.H5>
        Check out{' '}
        <a target='_blank' href='https://docs.latitude.so/guides/sdk/python'>
          <Text.H5 underline color='primary'>
            our docs
          </Text.H5>
        </a>{' '}
        for more details.
      </Text.H5>
    </div>
  )
}
