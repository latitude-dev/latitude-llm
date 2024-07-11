import {
  CUSTOM_MESSAGE_ROLE_ATTR,
  CUSTOM_MESSAGE_TAG,
  REFERENCE_PROMPT_ATTR,
} from '$compiler/constants'
import CompileError, { error } from '$compiler/error/error'
import errors from '$compiler/error/errors'
import parse from '$compiler/parser/index'
import type {
  BaseNode,
  ElementTag,
  MessageTag,
  TemplateNode,
  ToolCallTag,
} from '$compiler/parser/interfaces'
import {
  AssistantMessage,
  ContentType,
  Conversation,
  Message,
  MessageContent,
  MessageRole,
  SystemMessage,
  ToolCall,
  ToolMessage,
  UserMessage,
} from '$compiler/types'
import type { Node as LogicalExpression } from 'estree'

import { readConfig } from './config'
import { resolveLogicNode } from './logic'
import Scope from './scope'
import {
  hasContent,
  isContentTag,
  isIterable,
  isMessageTag,
  isRefTag,
  isToolCallTag,
  removeCommonIndent,
} from './utils'

export type ReferencePromptFn = (prompt: string) => Promise<string>
type ToolCallReference = { node: ToolCallTag; value: ToolCall }

export class Compile {
  private rawText: string
  private referenceFn?: ReferencePromptFn

  private initialScope: Scope

  private messages: Message[] = []
  private accumulatedText: string = ''
  private accumulatedContent: MessageContent[] = []
  private accumulatedToolCalls: ToolCallReference[] = []

  constructor({
    prompt,
    parameters,
    referenceFn,
  }: {
    prompt: string
    parameters: Record<string, unknown>
    referenceFn?: ReferencePromptFn
  }) {
    this.rawText = prompt
    this.referenceFn = referenceFn
    this.initialScope = new Scope(parameters)
  }

  async run(): Promise<Conversation> {
    const conversation = await this.runWithoutGrouping()
    this.groupAccumulatedContentAsMessage()

    return {
      config: conversation.config,
      messages: this.messages,
    }
  }

  private async runWithoutGrouping(): Promise<Conversation> {
    const fragment = parse(this.rawText)
    const config = readConfig(fragment) as Record<string, unknown>
    await this.resolveBaseNode({
      node: fragment,
      scope: this.initialScope,
      isInsideMessageTag: false,
      isInsideContentTag: false,
    })

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

  private async resolveTagAttributes({
    tagNode,
    scope,
    literalAttributes = [], // Tags that don't allow Mustache expressions
  }: {
    tagNode: ElementTag
    scope: Scope
    literalAttributes?: string[]
  }): Promise<Record<string, unknown>> {
    const attributeNodes = tagNode.attributes
    if (attributeNodes.length === 0) return {}

    const attributes: Record<string, unknown> = {}
    for (const attributeNode of attributeNodes) {
      const { name, value } = attributeNode
      if (value === true) {
        attributes[name] = true
        continue
      }

      if (literalAttributes.includes(name)) {
        if (value.some((node) => node.type === 'MustacheTag')) {
          this.baseNodeError(
            errors.invalidStaticAttribute(name),
            value.find((node) => node.type === 'MustacheTag')!,
          )
        }
      }

      let totalValue: string = ''
      for await (const node of value) {
        if (node.type === 'Text') {
          totalValue += node.data
          continue
        }

        if (node.type === 'MustacheTag') {
          const expression = node.expression
          const resolvedValue = await this.resolveExpression(expression, scope)
          if (resolvedValue === undefined) continue
          totalValue += String(resolvedValue)
          continue
        }
      }

      attributes[name] = totalValue
    }

    return attributes
  }

  private addText(text: string) {
    this.accumulatedText += text
  }

  private groupAccumulatedTextAsContent(): void {
    if (this.accumulatedText.trim() !== '') {
      this.accumulatedContent.push({
        type: ContentType.text,
        value: removeCommonIndent(this.accumulatedText).trim(),
      })
    }
    this.accumulatedText = ''
  }

  private addToolCall(toolCallTag: ToolCallTag, toolCall: ToolCall): void {
    this.groupAccumulatedTextAsContent()
    this.accumulatedToolCalls.push({ node: toolCallTag, value: toolCall })
  }

  private addContent(content: MessageContent): void {
    this.groupAccumulatedTextAsContent()
    this.accumulatedContent.push(content)
  }

  private groupAccumulatedContentAsMessage(): void {
    this.groupAccumulatedTextAsContent()

    if (this.accumulatedContent.length > 0) {
      const message = this.buildMessage({
        role: MessageRole.system,
        attributes: {},
        content: this.accumulatedContent,
        toolCalls: this.accumulatedToolCalls,
      })
      this.messages.push(message)
    }

    this.accumulatedContent = []
    this.accumulatedToolCalls = []
  }

  private async resolveBaseNode({
    node,
    scope,
    isInsideMessageTag,
    isInsideContentTag,
  }: {
    node: TemplateNode
    scope: Scope
    isInsideMessageTag: boolean
    isInsideContentTag: boolean
  }): Promise<void> {
    if (node.type === 'Fragment') {
      for await (const childNode of node.children ?? []) {
        await this.resolveBaseNode({
          node: childNode,
          scope,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'Config' || node.type === 'Comment') {
      /* do nothing */
      return
    }

    if (node.type === 'Text') {
      this.addText(node.data)
      return
    }

    if (node.type === 'MustacheTag') {
      const expression = node.expression
      const value = await this.resolveExpression(expression, scope)
      if (value === undefined) return
      this.addText(String(value))
      return
    }

    if (node.type === 'IfBlock') {
      const condition = await this.resolveExpression(node.expression, scope)
      const children = (condition ? node.children : node.else?.children) ?? []
      const childScope = scope.copy()
      for await (const childNode of children ?? []) {
        await this.resolveBaseNode({
          node: childNode,
          scope: childScope,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'EachBlock') {
      const iterableElement = await this.resolveExpression(
        node.expression,
        scope,
      )
      if (
        !isIterable(iterableElement) ||
        !(await hasContent(iterableElement))
      ) {
        const childScope = scope.copy()
        for await (const childNode of node.else?.children ?? []) {
          await this.resolveBaseNode({
            node: childNode,
            scope: childScope,
            isInsideMessageTag,
            isInsideContentTag,
          })
        }
        return
      }

      const contextVarName = node.context.name
      const indexVarName = node.index?.name
      if (scope.exists(contextVarName)) {
        throw this.expressionError(
          errors.variableAlreadyDeclared(contextVarName),
          node.context,
        )
      }
      if (indexVarName && scope.exists(indexVarName)) {
        throw this.expressionError(
          errors.variableAlreadyDeclared(indexVarName),
          node.index!,
        )
      }

      let i = 0
      for await (const element of iterableElement) {
        const localScope = scope.copy()
        localScope.set(contextVarName, element)
        if (indexVarName) {
          let indexValue: unknown = i
          if (node.key) {
            indexValue = await this.resolveExpression(node.key, localScope)
          }
          localScope.set(indexVarName, indexValue)
        }
        for await (const childNode of node.children ?? []) {
          await this.resolveBaseNode({
            node: childNode,
            scope: localScope,
            isInsideMessageTag,
            isInsideContentTag,
          })
        }
        i++
      }
      return
    }

    if (node.type === 'ElementTag') {
      this.groupAccumulatedTextAsContent()

      if (isToolCallTag(node)) {
        if (isInsideContentTag) {
          this.baseNodeError(errors.toolCallTagInsideContent, node)
        }

        const attributes = await this.resolveTagAttributes({
          tagNode: node,
          scope,
        })

        if (attributes['id'] === undefined) {
          this.baseNodeError(errors.toolCallTagWithoutId, node)
        }

        if (attributes['name'] === undefined) {
          this.baseNodeError(errors.toolCallWithoutName, node)
        }

        for await (const childNode of node.children ?? []) {
          await this.resolveBaseNode({
            node: childNode,
            scope,
            isInsideMessageTag,
            isInsideContentTag: true,
          })
        }

        const textContent = this.accumulatedText
        this.accumulatedText = ''

        let jsonContent: Record<string, unknown> = {}
        if (textContent) {
          try {
            jsonContent = JSON.parse(textContent)
          } catch (error: unknown) {
            if (error instanceof SyntaxError) {
              this.baseNodeError(errors.invalidToolCallArguments, node)
            }
          }
        }

        this.addToolCall(node as ToolCallTag, {
          id: String(attributes['id']),
          name: String(attributes['name']),
          arguments: jsonContent,
        })
        return
      }

      if (isContentTag(node)) {
        if (isInsideContentTag) {
          this.baseNodeError(errors.contentTagInsideContent, node)
        }

        this.groupAccumulatedTextAsContent()
        for await (const childNode of node.children ?? []) {
          await this.resolveBaseNode({
            node: childNode,
            scope,
            isInsideMessageTag,
            isInsideContentTag: true,
          })
        }
        const textContent = this.accumulatedText
        this.accumulatedText = ''

        this.addContent({
          type: node.name as ContentType,
          value: textContent,
        })
        return
      }

      if (isMessageTag(node)) {
        if (isInsideContentTag || isInsideMessageTag) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
        }

        this.groupAccumulatedContentAsMessage()

        const attributes = await this.resolveTagAttributes({
          tagNode: node,
          scope,
        })

        let role = node.name as MessageRole
        if (node.name === CUSTOM_MESSAGE_TAG) {
          if (attributes[CUSTOM_MESSAGE_ROLE_ATTR] === undefined) {
            this.baseNodeError(errors.messageTagWithoutRole, node)
          }
          role = attributes[CUSTOM_MESSAGE_ROLE_ATTR] as MessageRole
          delete attributes[CUSTOM_MESSAGE_ROLE_ATTR]
        }

        for await (const childNode of node.children ?? []) {
          await this.resolveBaseNode({
            node: childNode,
            scope,
            isInsideMessageTag: true,
            isInsideContentTag,
          })
        }

        this.groupAccumulatedTextAsContent()
        const messageContent = this.accumulatedContent
        const toolCalls = this.accumulatedToolCalls

        this.accumulatedContent = []
        this.accumulatedToolCalls = []

        const message = this.buildMessage({
          node: node as MessageTag,
          role,
          attributes,
          content: messageContent,
          toolCalls,
        })
        this.messages.push(message)
        return
      }

      if (isRefTag(node)) {
        if (isInsideMessageTag || isInsideContentTag) {
          this.baseNodeError(errors.invalidReferencePromptPlacement, node)
        }

        if (node.children?.length ?? 0 > 0) {
          this.baseNodeError(errors.referenceTagHasContent, node)
        }

        const attributes = await this.resolveTagAttributes({
          tagNode: node,
          scope,
          literalAttributes: [REFERENCE_PROMPT_ATTR],
        })

        if (typeof attributes[REFERENCE_PROMPT_ATTR] !== 'string') {
          this.baseNodeError(errors.referenceTagWithoutPrompt, node)
        }

        if (!this.referenceFn) {
          this.baseNodeError(errors.missingReferenceFunction, node)
        }

        const refPromptPath = attributes[REFERENCE_PROMPT_ATTR]
        try {
          const refPrompt = await this.referenceFn(refPromptPath)
          const refPromptCompile = new Compile({
            prompt: refPrompt,
            parameters: {},
            referenceFn: this.referenceFn,
          })
          refPromptCompile.initialScope = scope // This will let the ref prompt modify variables from this one
          refPromptCompile.accumulatedText = this.accumulatedText
          refPromptCompile.accumulatedContent = this.accumulatedContent
          refPromptCompile.accumulatedToolCalls = this.accumulatedToolCalls

          const refConversation = await refPromptCompile.runWithoutGrouping()
          this.messages.push(...refConversation.messages)
          this.accumulatedText = refPromptCompile.accumulatedText
          this.accumulatedContent = refPromptCompile.accumulatedContent
          this.accumulatedToolCalls = refPromptCompile.accumulatedToolCalls
        } catch (error: unknown) {
          if (error instanceof CompileError) throw error
          this.baseNodeError(errors.referenceError(error), node)
        }
        return
      }

      this.baseNodeError(errors.unknownTag(node.name), node)
    }

    //@ts-ignore - Linter knows this should be unreachable. That's what this error is for.
    this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
  }

  private buildMessage({
    node,
    role,
    attributes,
    content,
    toolCalls,
  }: {
    node?: MessageTag
    role: MessageRole
    attributes: Record<string, unknown>
    content: MessageContent[]
    toolCalls: ToolCallReference[]
  }): Message {
    if (role !== MessageRole.assistant) {
      toolCalls.forEach(({ node: toolNode }) => {
        this.baseNodeError(errors.invalidToolCallPlacement, toolNode)
      })
    }

    if (role === MessageRole.system) {
      return {
        role,
        content,
      } as SystemMessage
    }

    if (role === MessageRole.user) {
      return {
        role,
        name: attributes.name ? String(attributes.name) : undefined,
        content,
      } as UserMessage
    }

    if (role === MessageRole.assistant) {
      return {
        role,
        toolCalls: toolCalls.map(({ value }) => value),
        content,
      } as AssistantMessage
    }

    if (role === MessageRole.tool) {
      if (attributes.id === undefined) {
        this.baseNodeError(errors.toolMessageWithoutId, node!)
      }

      return {
        role,
        id: String(attributes.id),
        content,
      } as ToolMessage
    }

    this.baseNodeError(errors.invalidMessageRole(role), node!)
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
