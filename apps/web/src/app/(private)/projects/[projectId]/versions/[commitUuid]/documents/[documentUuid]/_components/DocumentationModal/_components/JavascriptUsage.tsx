import { CodeBlock } from '@latitude-data/web-ui/atoms/CodeBlock'
import { Text } from '@latitude-data/web-ui/atoms/Text'
import { UsedToolsDoc } from '../index'
import { HEAD_COMMIT } from '@latitude-data/core/constants'

function getToolsString(tools: UsedToolsDoc[]) {
  if (!tools.length) return ''

  const toolEntries = tools
    .map(({ name, parameters }, index: number) => {
      const paramList = parameters.map((param) => `${param}`).join(', ')

      if (index !== 0) {
        return `    ${name}: async ({ ${paramList} } }) => { \n      //...\n    }`
      }

      return `    ${name}: async ({ ${paramList} }, details) => {
      // Details are included to be able to pause execution
      // Learn more about pausing tool execution:
      // http://docs.latitude.so/guides/sdk/typescript#pausing-tool-execution

      // This is where you call your code to get the result
      const data = await yourServiceToGet${name}({ ${paramList} })
      const result = await data.json()

      // The result can be anything JSON serializable
      return result
    }`
    })
    .join(',\n')

  return `  tools: {
${toolEntries}
  }`
}

export function JavascriptUsage({
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

    const parameterEntries = Array.from(parameters)
      .map((key) => `     ${key}: ''`)
      .join(',\n')

    return `  parameters: {
${parameterEntries}
  }`
  }

  const getRunOptions = () => {
    const options = []

    if (commitUuid !== HEAD_COMMIT) {
      options.push(`  versionUuid: '${commitUuid}'`)
    }

    const parametersString = getParametersString()
    if (parametersString) {
      options.push(parametersString)
    }

    const toolsString = getToolsString(tools)

    if (toolsString) {
      options.push(toolsString)
    }

    return options.length > 0 ? `{\n${options.join(',\n')}\n}` : ''
  }

  const sdkCode = `import { Latitude } from '@latitude-data/sdk'

// Do not expose the API key in client-side code
const sdk = new Latitude('${apiKey ?? 'YOUR_API_KEY'}', { projectId: ${projectId} })

const result = await sdk.prompts.run('${documentPath}'${getRunOptions() ? `, ${getRunOptions()}` : ''})
`

  return (
    <div className='flex flex-col gap-4'>
      <Text.H5>
        First, to run this document programmatically, install the SDK:
      </Text.H5>
      <CodeBlock language='bash'>npm install @latitude-data/sdk</CodeBlock>
      <Text.H5>Then, use the following code to run the document:</Text.H5>
      <CodeBlock language='typescript'>{sdkCode}</CodeBlock>
      <Text.H5>
        Check out{' '}
        <a
          target='_blank'
          href='https://docs.latitude.so/guides/sdk/typescript'
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
