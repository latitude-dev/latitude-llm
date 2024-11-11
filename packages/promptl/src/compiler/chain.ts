import { CHAIN_STEP_ISOLATED_ATTR } from '$promptl/constants'
import parse from '$promptl/parser'
import { Fragment } from '$promptl/parser/interfaces'
import {
  Config,
  ContentType,
  Conversation,
  Message,
  MessageContent,
  MessageRole,
} from '$promptl/types'

import { Compile } from './compile'
import Scope from './scope'
import { CompileOptions } from './types'

type ChainStep = {
  conversation: Conversation
  completed: boolean
}

export class Chain {
  public rawText: string

  private compileOptions: CompileOptions
  private ast: Fragment
  private scope: Scope
  private didStart: boolean = false
  private _completed: boolean = false

  private globalMessages: Message[] = []
  private globalConfig: Config | undefined
  private wasLastStepIsolated: boolean = false

  constructor({
    prompt,
    parameters = {},
    ...compileOptions
  }: {
    prompt: string
    parameters?: Record<string, unknown>
  } & CompileOptions) {
    this.rawText = prompt
    this.ast = parse(prompt)
    this.scope = new Scope(parameters)
    this.compileOptions = compileOptions
  }

  async step(response?: MessageContent[] | string): Promise<ChainStep> {
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

    const responseContent = buildStepResponseContent(response)
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
      conversation: {
        messages: stepMessages,
        config,
      },
      completed: this._completed,
    }
  }

  get completed(): boolean {
    return this._completed
  }
}

export function buildStepResponseContent(
  response?: MessageContent[] | string,
): MessageContent[] | undefined {
  if (response == undefined) return response
  if (Array.isArray(response)) return response

  return [
    {
      type: ContentType.text,
      text: response,
    },
  ]
}
