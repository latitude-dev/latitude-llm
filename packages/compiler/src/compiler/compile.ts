import { error } from '$compiler/error/error'
import errors from '$compiler/error/errors'
import type {
  BaseNode,
  Fragment,
  TemplateNode,
} from '$compiler/parser/interfaces'
import {
  AssistantMessage,
  Config,
  ContentType,
  Message,
  MessageContent,
  MessageRole,
  SystemMessage,
} from '$compiler/types'
import type { Node as LogicalExpression } from 'estree'

import { compile as resolveComment } from './base/nodes/comment'
import { compile as resolveConfig } from './base/nodes/config'
import { compile as resolveEachBlock } from './base/nodes/each'
import { compile as resolveFragment } from './base/nodes/fragment'
import { compile as resolveIfBlock } from './base/nodes/if'
import { compile as resolveMustache } from './base/nodes/mustache'
import { compile as resolveElementTag } from './base/nodes/tag'
import { compile as resolveText } from './base/nodes/text'
import { CompileNodeContext, TemplateNodeWithStatus } from './base/types'
import { resolveLogicNode } from './logic'
import Scope, { ScopeStash } from './scope'
import type { ResolveBaseNodeProps, ToolCallReference } from './types'
import { removeCommonIndent } from './utils'

export type CompilationStatus = {
  completed: boolean
  scopeStash: ScopeStash
  ast: Fragment
  messages: Message[]
  stepConfig: Config | undefined
  globalConfig: Config | undefined
}

class StopIteration extends Error {
  public readonly config: Config | undefined
  constructor(config: Config | undefined) {
    super('StopIteration')
    this.config = config
  }
}

export class Compile {
  private ast: Fragment
  private rawText: string
  private globalScope: Scope

  private messages: Message[] = []
  private config: Config | undefined
  private stepResponse: string | undefined

  private accumulatedText: string = ''
  private accumulatedContent: MessageContent[] = []
  private accumulatedToolCalls: ToolCallReference[] = []

  constructor({
    ast,
    rawText,
    globalScope,
    stepResponse,
  }: {
    rawText: string
    globalScope: Scope
    ast: Fragment
    stepResponse?: string
  }) {
    this.rawText = rawText
    this.globalScope = globalScope
    this.ast = ast
    this.stepResponse = stepResponse
  }

  async run(): Promise<CompilationStatus> {
    let completed = true
    let stepConfig: Config | undefined = undefined

    try {
      await this.resolveBaseNode({
        node: this.ast,
        scope: this.globalScope,
        isInsideMessageTag: false,
        isInsideContentTag: false,
      })
    } catch (e) {
      if (e instanceof StopIteration) {
        completed = false
        stepConfig = e.config
      } else {
        throw e
      }
    }

    this.groupContent()

    return {
      ast: this.ast,
      scopeStash: this.globalScope.getStash(),
      messages: this.messages,
      globalConfig: this.config,
      stepConfig,
      completed,
    }
  }

  private stop(config: Config | undefined): void {
    throw new StopIteration(config)
  }

  private addMessage(message: Message): void {
    this.messages.push(message)
  }

  private setConfig(config: Config): void {
    if (this.config !== undefined) return
    this.config = config
  }

  private addStrayText(text: string) {
    this.accumulatedText += text
  }

  private groupStrayText(): void {
    if (this.accumulatedText.trim() !== '') {
      this.accumulatedContent.push({
        type: ContentType.text,
        value: removeCommonIndent(this.accumulatedText).trim(),
      })
    }
    this.accumulatedText = ''
  }

  private popStrayText(): string {
    const text = this.accumulatedText
    this.accumulatedText = ''
    return text
  }

  private addContent(content: MessageContent): void {
    this.groupStrayText()
    this.accumulatedContent.push(content)
  }

  private groupContent(): void {
    this.groupStrayText()
    const toolCalls = this.popToolCalls()
    const content = this.popContent()

    toolCalls.forEach(({ node: toolNode }) => {
      this.baseNodeError(errors.invalidToolCallPlacement, toolNode)
    })

    if (content.length > 0) {
      const message = {
        role: MessageRole.system,
        content,
      } as SystemMessage

      this.addMessage(message)
    }
  }

  private popContent(): MessageContent[] {
    const content = this.accumulatedContent
    this.accumulatedContent = []
    return content
  }

  private addToolCall(toolCallRef: ToolCallReference): void {
    this.groupStrayText()
    this.accumulatedToolCalls.push(toolCallRef)
  }

  private popToolCalls(): ToolCallReference[] {
    const toolCalls = this.accumulatedToolCalls
    this.accumulatedToolCalls = []
    return toolCalls
  }

  private popStepResponse(): AssistantMessage | undefined {
    if (this.stepResponse === undefined) return undefined
    const response = {
      role: MessageRole.assistant,
      content: [
        {
          type: ContentType.text,
          value: this.stepResponse,
        },
      ],
    } as AssistantMessage
    this.stepResponse = undefined
    return response
  }

  private async resolveExpression(
    expression: LogicalExpression,
    scope: Scope,
  ): Promise<unknown> {
    return await resolveLogicNode({
      node: expression,
      scope,
      raiseError: this.expressionError.bind(this),
    })
  }

  private async resolveBaseNode({
    node,
    scope,
    isInsideMessageTag,
    isInsideContentTag,
    completedValue = true,
  }: ResolveBaseNodeProps<TemplateNode>): Promise<void> {
    const nodeWithStatus = node as TemplateNodeWithStatus
    const compileStatus = nodeWithStatus.status

    // Skip node if it has been marked as completed
    if (compileStatus?.completedAs === completedValue) {
      return
    }

    // Restore scope saved in the node status
    if (compileStatus?.scopePointers) {
      scope.setPointers(compileStatus.scopePointers)
    }

    const resolveBaseNodeFn = (props: ResolveBaseNodeProps<TemplateNode>) => {
      const completedValueProp = props.completedValue ?? completedValue
      return this.resolveBaseNode({
        ...props,
        completedValue: completedValueProp,
      })
    }

    const context: CompileNodeContext<TemplateNode> = {
      node,
      scope,
      isInsideMessageTag,
      isInsideContentTag,
      resolveBaseNode: resolveBaseNodeFn.bind(this),
      resolveExpression: this.resolveExpression.bind(this),
      baseNodeError: this.baseNodeError.bind(this),
      expressionError: this.expressionError.bind(this),
      setConfig: this.setConfig.bind(this),
      addMessage: this.addMessage.bind(this),
      addStrayText: this.addStrayText.bind(this),
      popStrayText: this.popStrayText.bind(this),
      groupStrayText: this.groupStrayText.bind(this),
      addContent: this.addContent.bind(this),
      popContent: this.popContent.bind(this),
      groupContent: this.groupContent.bind(this),
      addToolCall: this.addToolCall.bind(this),
      popToolCalls: this.popToolCalls.bind(this),
      popStepResponse: this.popStepResponse.bind(this),
      stop: this.stop.bind(this),
    }

    const nodeResolver = {
      Fragment: resolveFragment,
      Config: resolveConfig,
      Comment: resolveComment,
      Text: resolveText,
      MustacheTag: resolveMustache,
      IfBlock: resolveIfBlock,
      EachBlock: resolveEachBlock,
      ElementTag: resolveElementTag,
    }

    if (!(node.type in nodeResolver)) {
      this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
    }

    try {
      const resolverFn = nodeResolver[node.type] as (
        context: CompileNodeContext<TemplateNode>,
      ) => Promise<void>
      await resolverFn(context)
    } catch (e) {
      if (e instanceof StopIteration) {
        // If the node has stopped unexpectedly, save the current pointers for future recovery
        nodeWithStatus.status = {
          ...(nodeWithStatus.status ?? {}),
          scopePointers: scope.getPointers(),
        }
      }

      throw e
    }

    // Mark node as completed
    nodeWithStatus.status = {
      ...(nodeWithStatus.status ?? {}),
      scopePointers: undefined,
      completedAs: completedValue,
    }
  }

  private baseNodeError(
    { code, message }: { code: string; message: string },
    node: BaseNode,
  ): never {
    error(message, {
      name: 'CompileError',
      code,
      source: this.rawText || '',
      start: node.start || 0,
      end: node.end || undefined,
    })
  }

  private expressionError(
    { code, message }: { code: string; message: string },
    node: LogicalExpression,
  ): never {
    const source = (node.loc?.source ?? this.rawText)!.split('\n')
    const start =
      source
        .slice(0, node.loc?.start.line! - 1)
        .reduce((acc, line) => acc + line.length + 1, 0) +
      node.loc?.start.column!
    const end =
      source
        .slice(0, node.loc?.end.line! - 1)
        .reduce((acc, line) => acc + line.length + 1, 0) + node.loc?.end.column!

    error(message, {
      name: 'CompileError',
      code,
      source: this.rawText || '',
      start,
      end,
    })
  }
}
