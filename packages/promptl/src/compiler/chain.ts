import { CHAIN_STEP_ISOLATED_ATTR } from '$promptl/constants'
import parse from '$promptl/parser'
import { Fragment } from '$promptl/parser/interfaces'
import {
  AdapterMessageType,
  Adapters,
  ProviderAdapter,
} from '$promptl/providers'
import { ProviderConversation } from '$promptl/providers/adapter'
import {
  Config,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
} from '$promptl/types'

import { Compile } from './compile'
import Scope from './scope'
import { CompileOptions } from './types'

type ChainStep<M extends AdapterMessageType> = {
  conversation: ProviderConversation<M>
  completed: boolean
}

type StepResponse<M extends AdapterMessageType> =
  | string
  | (Omit<M, 'role'> & {
      role?: M['role']
    })

export class Chain<M extends AdapterMessageType = Message> {
  public rawText: string

  private compileOptions: CompileOptions
  private ast: Fragment
  private scope: Scope
  private didStart: boolean = false
  private _completed: boolean = false

  private adapter: ProviderAdapter<M>
  private globalMessages: Message[] = []
  private globalConfig: Config | undefined
  private wasLastStepIsolated: boolean = false

  constructor({
    prompt,
    parameters = {},
    adapter = Adapters.default as ProviderAdapter<M>,
    ...compileOptions
  }: {
    prompt: string
    parameters?: Record<string, unknown>
    adapter?: ProviderAdapter<M>
  } & CompileOptions) {
    this.rawText = prompt
    this.ast = parse(prompt)
    this.scope = new Scope(parameters)
    this.compileOptions = compileOptions
    this.adapter = adapter
  }

  private buildStepResponseContent(
    response?: StepResponse<M>,
  ): MessageContent[] | undefined {
    if (response == undefined) return response

    if (typeof response === 'string') {
      return [{ type: ContentType.text, text: response }]
    }

    const responseMessage = {
      ...response,
      role: response.role ?? MessageRole.assistant,
    } as M

    const convertedMessages = this.adapter.toPromptl({
      config: this.globalConfig ?? {},
      messages: [responseMessage],
    })

    return convertedMessages.messages[0]!.content
  }

  async step(response?: StepResponse<M>): Promise<ChainStep<M>> {
    if (this._completed) {
      throw new Error('The chain has already completed')
    }
    if (!this.didStart && response !== undefined) {
      throw new Error('A response is not allowed before the chain has started')
    }
    if (this.didStart && response === undefined) {
      throw new Error('A response is required to continue the chain')
    }
    this.didStart = true

    const responseContent = this.buildStepResponseContent(response)
    if (responseContent && !this.wasLastStepIsolated) {
      this.globalMessages.push({
        role: MessageRole.assistant,
        content: responseContent ?? [],
      })
    }

    const compile = new Compile({
      ast: this.ast,
      rawText: this.rawText,
      globalScope: this.scope,
      stepResponse: responseContent,
      ...this.compileOptions,
    })

    const {
      completed,
      scopeStash,
      ast,
      messages: messages,
      globalConfig,
      stepConfig,
    } = await compile.run()

    this.scope = Scope.withStash(scopeStash).copy(this.scope.getPointers())
    this.ast = ast

    this.globalConfig = globalConfig ?? this.globalConfig
    this._completed = completed && !messages.length // If it returned a message, there is still a final step to be taken

    const config = {
      ...this.globalConfig,
      ...stepConfig,
    }

    this.wasLastStepIsolated = !!config[CHAIN_STEP_ISOLATED_ATTR]

    const stepMessages = [
      ...(this.wasLastStepIsolated ? [] : this.globalMessages),
      ...messages,
    ]

    if (!this.wasLastStepIsolated) this.globalMessages.push(...messages)

    return {
      conversation: this.adapter.fromPromptl({
        messages: stepMessages,
        config,
      }),
      completed: this._completed,
    }
  }

  get completed(): boolean {
    return this._completed
  }
}
