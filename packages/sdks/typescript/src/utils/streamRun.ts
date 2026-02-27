import { LatitudeApiError } from '$sdk/utils/errors'
import { handleStream } from '$sdk/utils/handleStream'
import { makeRequest } from '$sdk/utils/request'
import {
  HandlerType,
  RunPromptOptions,
  SDKOptions,
  ToolSpec,
} from '$sdk/utils/types'
import { AssertedStreamType, ProviderData } from '@latitude-data/constants/ai'
import {
  ApiErrorCodes,
  ApiErrorJsonResponse,
  LatitudeErrorCodes,
} from '@latitude-data/constants/errors'

export async function streamRun<
  Tools extends ToolSpec,
  S extends AssertedStreamType = 'text',
>(
  path: string,
  {
    projectId,
    versionUuid,
    parameters,
    tools,
    customIdentifier,
    userMessage,
    messages,
    mcpHeaders,
    onEvent,
    onFinished,
    onError,
    options,
  }: RunPromptOptions<Tools, S, false> & {
    options: SDKOptions
  },
) {
  projectId = projectId ?? options.projectId

  if (!projectId) {
    const error = new LatitudeApiError({
      status: 404,
      message: 'Project ID is required',
      serverResponse: 'Project ID is required',
      errorCode: LatitudeErrorCodes.NotFoundError,
    })
    onError?.(error)
    return Promise.reject(error)
  }

  versionUuid = versionUuid ?? options.versionUuid

  try {
    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.RunDocument,
      params: { projectId, versionUuid },
      options,
      body: {
        stream: true,
        background: false,
        path,
        parameters,
        customIdentifier,
        tools: waitForTools(tools),
        userMessage,
        messages,
        mcpHeaders,
      },
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: response.statusText,
        message: json.message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })
      onError?.(error)
      return
    }

    const finalResponse = await handleStream<S>({
      body: response.body!,
      onEvent,
      onToolCall: handleToolCallFactory({
        tools,
        options,
      }),
      signal: options.signal,
    })

    if (!finalResponse) return

    onFinished?.(finalResponse)

    return finalResponse
  } catch (e) {
    let error = e as LatitudeApiError

    if (!(e instanceof LatitudeApiError)) {
      const err = e as Error
      error = new LatitudeApiError({
        status: 500,
        message: err.message,
        serverResponse: err.stack ?? '',
        errorCode: ApiErrorCodes.InternalServerError,
      })
    }

    onError?.(error)
    return
  }
}

export function handleToolCallFactory<T extends ToolSpec>({
  tools,
  options,
}: {
  tools?: RunPromptOptions<T>['tools']
  options: SDKOptions
}) {
  return async (data: ProviderData) => {
    if (data.type !== 'tool-call') return

    const toolName = data.toolName as keyof T
    const tool = tools?.[toolName]
    // NOTE: If handler not found, do not handle tool call because it could be a built-in tool
    if (!tool) return

    const result = await tool(data.args as T[typeof toolName], {
      id: data.toolCallId,
      name: data.toolName,
      arguments: data.args,
    })

    const response = await makeRequest({
      method: 'POST',
      handler: HandlerType.ToolResults,
      body: {
        toolCallId: data.toolCallId,
        result,
      },
      options,
    })

    if (!response.ok) {
      const json = (await response.json()) as ApiErrorJsonResponse
      const message = `Failed to execute tool ${data.toolName}.
Latitude API returned the following error:

${json.message}`

      const error = new LatitudeApiError({
        status: response.status,
        serverResponse: response.statusText,
        message,
        errorCode: json.errorCode,
        dbErrorRef: json.dbErrorRef,
      })

      throw error
    }
  }
}

export function waitForTools(tools?: Record<string, unknown>) {
  return Object.keys(tools ?? {})
}
