import { UsedToolsDoc } from '../index'
import { HEAD_COMMIT } from '@latitude-data/core/browser'
import { CodeBlock, Text } from '@latitude-data/web-ui'

function getToolsString(tools: UsedToolsDoc[]) {
  if (!tools.length) return ''

  const toolEntries = tools
    .map(({ name, parameters }, index: number) => {
      if (index !== 0)
        return `    ${name}: async ({ id, arguments: { ${parameters.join(', ')} } }) => { \n      //...\n    }`

      const paramList = parameters.map((param) => `${param}`).join(', ')
      return `    ${name}: async ({ id, arguments: { ${paramList} } }, details) => {
      // Details can be used to pause execution
      // Know more about pause execution in the docs:
      // http://docs.latitude.so/guides/sdk/typescript#pausing-tool-execution

      // This is where you call your code to get the result
      const data = await yourServficeToGet${name}({ ${paramList} })
      const result = await data.json()

      // You have to return. The ID of the tool, the name of the tool, and the result
      // Result can be valid JSON
      return {
        id,
        name: '${name}',
        result,
      }
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
