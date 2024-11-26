import parse from '$compiler/parser'
import { Fragment } from '$compiler/parser/interfaces'
import { Config, Conversation, Message } from '$compiler/types'

import { Compile } from './compile'
import Scope from './scope'
import { CompileOptions } from './types'

type ChainStep = {
  conversation: Conversation
  completed: boolean
}

export class Chain {
  public rawText: string

  private options: CompileOptions
  private ast: Fragment
  private scope: Scope
  private didStart: boolean = false
  private _completed: boolean = false

  private messages: Message[] = []
  private config: Config | undefined

  constructor({
    prompt,
    parameters,
    ...options
  }: {
    prompt: string
    parameters: Record<string, unknown>
  } & CompileOptions) {
    this.rawText = prompt
    this.ast = parse(prompt)
    this.scope = new Scope(parameters)
    this.options = options
  }

  async step(response?: string): Promise<ChainStep> {
    if (this._completed) {
      throw new Error('The chain has already completed')
    }
    if (!this.didStart && response !== undefined) {
      throw new Error('A response is not allowed before the chain has started')
    }
    if (this.didStart && response === undefined) {
      throw new Error('A response is required to continue a chain')
    }
    this.didStart = true

    const compile = new Compile({
      ast: this.ast,
      rawText: this.rawText,
      globalScope: this.scope,
      stepResponse: response,
      ...this.options,
    })

    const { completed, scopeStash, ast, messages, globalConfig, stepConfig } =
      await compile.run()

    this.scope = Scope.withStash(scopeStash).copy(this.scope.getPointers())
    this.ast = ast
    this.messages.push(...messages)
    this.config = globalConfig ?? this.config
    this._completed = completed || this._completed

    const config = {
      ...this.config,
      ...stepConfig,
    }

    return {
      conversation: {
        messages: this.messages,
        config,
      },
      completed: this._completed,
    }
  }

  get completed(): boolean {
    return this._completed
  }
}
