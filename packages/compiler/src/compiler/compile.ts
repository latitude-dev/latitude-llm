import { error } from '$compiler/error/error'
import errors from '$compiler/error/errors'
import parse from '$compiler/parser/index'
import type { BaseNode, TemplateNode } from '$compiler/parser/interfaces'
import {
  ContentType,
  Conversation,
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
import { CompileNodeContext } from './base/types'
import { readConfig } from './config'
import { resolveLogicNode } from './logic'
import Scope from './scope'
import type { ResolveBaseNodeProps, ToolCallReference } from './types'
import { removeCommonIndent } from './utils'

export type ReferencePromptFn = (prompt: string) => Promise<string>

export class Compile {
  private rawText: string

  private initialScope: Scope

  private messages: Message[] = []
  private accumulatedText: string = ''
  private accumulatedContent: MessageContent[] = []
  private accumulatedToolCalls: ToolCallReference[] = []

  constructor({
    prompt,
    parameters,
  }: {
    prompt: string
    parameters: Record<string, unknown>
  }) {
    this.rawText = prompt
    this.initialScope = new Scope(parameters)
  }

  async run(): Promise<Conversation> {
    const fragment = parse(this.rawText)
    const config = readConfig(fragment) as Record<string, unknown>
    await this.resolveBaseNode({
      node: fragment,
      scope: this.initialScope,
      isInsideMessageTag: false,
      isInsideContentTag: false,
    })
    this.groupContent()

    return {
      config,
      messages: this.messages,
    }
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

  private addMessage(message: Message): void {
    this.messages.push(message)
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

  private async resolveBaseNode({
    node,
    scope,
    isInsideMessageTag,
    isInsideContentTag,
  }: ResolveBaseNodeProps<TemplateNode>): Promise<void> {
    const context: CompileNodeContext<TemplateNode> = {
      node,
      scope,
      isInsideMessageTag,
      isInsideContentTag,
      resolveBaseNode: this.resolveBaseNode.bind(this),
      resolveExpression: this.resolveExpression.bind(this),
      baseNodeError: this.baseNodeError.bind(this),
      expressionError: this.expressionError.bind(this),
      addMessage: this.addMessage.bind(this),
      addStrayText: this.addStrayText.bind(this),
      popStrayText: this.popStrayText.bind(this),
      groupStrayText: this.groupStrayText.bind(this),
      addContent: this.addContent.bind(this),
      popContent: this.popContent.bind(this),
      groupContent: this.groupContent.bind(this),
      addToolCall: this.addToolCall.bind(this),
      popToolCalls: this.popToolCalls.bind(this),
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

    const resolverFn = nodeResolver[node.type] as (
      context: CompileNodeContext<TemplateNode>,
    ) => Promise<void>
    await resolverFn(context)
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
