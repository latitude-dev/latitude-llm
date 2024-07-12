export type LatitudeSDKConfig = {
  baseUrl?: string
}

export namespace CreateCompletionResponse {
  export interface Response {
    promptId: string
    convoId: string
    choices: Array<Choice>
  }

  interface Choice {
    message: Message
  }

  interface Message {
    content: string
    role: 'assistant'
    tool_calls?: ToolCall[]
  }

  interface ToolCall {
    id: string
    function: Function
    type: 'function'
  }

  interface Function {
    /**
     * The arguments to call the function with, as generated by the model in JSON
     * format. Note that the model does not always generate valid JSON, and may
     * hallucinate parameters not defined by your function schema. Validate the
     * arguments in your code before calling your function.
     */
    arguments: string

    /**
     * The name of the function to call.
     */
    name: string
  }
}

export namespace CreateCompletionRequest {
  export interface Params {
    promptId: string
    convoId?: string
    params: Param[]
  }

  type Param = {
    id: string
    value: unknown
  }
}