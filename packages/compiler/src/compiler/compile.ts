import {
  CUSTOM_MESSAGE_ROLE_ATTR,
  CUSTOM_MESSAGE_TAG,
  REFERENCE_PROMPT_ATTR,
  REFERENCE_PROMPT_TAG,
  TOOL_CALL_TAG,
} from '$/constants'
import CompileError, { error } from '$/error/error'
import errors from '$/error/errors'
import parse from '$/parser/index'
import type { BaseNode, ElementTag } from '$/parser/interfaces'
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
} from '$/types'
import type { Node as LogicalExpression } from 'estree'

import { readConfig } from './config'
import { resolveLogicNode } from './logic'
import Scope from './scope'
import { hasContent, isIterable, removeCommonIndent } from './utils'

export type ReferencePromptFn = (prompt: string) => Promise<string>

export class Compile {
  private rawText: string
  private referenceFn?: ReferencePromptFn

  private initialScope: Scope

  // state management
  private messages: Message[] = []
  private accumulatedText: string = ''
  private accumulatedContent: MessageContent[] = []
  private accumulatedToolCalls: ToolCall[] = []

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

  /**
   * Resolves every block, expression, and function inside the SQL and returns the final query.
   *
   * Note: Compiling a query may take time in some cases, as some queries may contain expensive
   * functions that need to be resolved at runtime.
   */
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
      isInMessageTag: false,
      isInContentTag: false,
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

  private addToolCall(toolCall: ToolCall): void {
    this.groupAccumulatedTextAsContent()
    this.accumulatedToolCalls.push(toolCall)
  }

  private addContent(content: MessageContent): void {
    this.groupAccumulatedTextAsContent()
    this.accumulatedContent.push(content)
  }

  private groupAccumulatedContentAsMessage(): void {
    this.groupAccumulatedTextAsContent()

    if (this.accumulatedContent.length > 0) {
      this.messages.push({
        role: MessageRole.system,
        content: this.accumulatedContent,
      })
    }

    this.accumulatedContent = []
    this.accumulatedToolCalls = []
  }

  private async resolveBaseNode({
    node,
    scope,
    isInMessageTag,
    isInContentTag,
  }: {
    node: BaseNode
    scope: Scope
    isInMessageTag: boolean
    isInContentTag: boolean
  }): Promise<void> {
    if (node.type === 'Fragment') {
      for await (const childNode of node.children ?? []) {
        await this.resolveBaseNode({
          node: childNode,
          scope,
          isInMessageTag,
          isInContentTag,
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
          isInMessageTag,
          isInContentTag,
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
            isInMessageTag,
            isInContentTag,
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
            isInMessageTag,
            isInContentTag,
          })
        }
        i++
      }
      return
    }

    if (node.type === 'ElementTag') {
      this.groupAccumulatedTextAsContent()

      // ToolCall <tool_call id="123" name="foo">{ arguments }</tool_call>
      if (node.name === TOOL_CALL_TAG) {
        if (isInContentTag) {
          this.baseNodeError(errors.toolCallTagInsideContent, node)
        }

        const attributes = await this.resolveTagAttributes({
          tagNode: node as ElementTag,
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
            isInMessageTag,
            isInContentTag: true,
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

        this.addToolCall({
          id: String(attributes['id']),
          name: String(attributes['name']),
          arguments: jsonContent,
        })
        return
      }

      // MessageContent <text> or <image>
      if (Object.values(ContentType).includes(node.name as ContentType)) {
        if (isInContentTag) {
          this.baseNodeError(errors.contentTagInsideContent, node)
        }

        this.groupAccumulatedTextAsContent()
        for await (const childNode of node.children ?? []) {
          await this.resolveBaseNode({
            node: childNode,
            scope,
            isInMessageTag,
            isInContentTag: true,
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

      // MessageRole <user>, <assistant>, <system>, <tool> or <message role="…">
      if (
        Object.values(MessageRole).includes(node.name as MessageRole) ||
        node.name === CUSTOM_MESSAGE_TAG
      ) {
        if (isInContentTag || isInMessageTag) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
        }

        this.groupAccumulatedContentAsMessage()

        const attributes = await this.resolveTagAttributes({
          tagNode: node as ElementTag,
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
            isInMessageTag: true,
            isInContentTag,
          })
        }

        this.groupAccumulatedTextAsContent()
        const messageContent = this.accumulatedContent
        const toolCalls = this.accumulatedToolCalls

        this.accumulatedContent = []
        this.accumulatedToolCalls = []

        const message = this.buildMessage({
          node: node as ElementTag,
          role,
          attributes,
          content: messageContent,
          toolCalls,
        })
        this.messages.push(message)
        return
      }

      // Ref <ref prompt="…">
      if (node.name === REFERENCE_PROMPT_TAG) {
        if (isInMessageTag || isInContentTag) {
          this.baseNodeError(errors.invalidReferencePromptPlacement, node)
        }

        if (node.children?.length ?? 0 > 0) {
          this.baseNodeError(errors.referenceTagHasContent, node)
        }

        const attributes = await this.resolveTagAttributes({
          tagNode: node as ElementTag,
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

      if (isInMessageTag) {
        this.baseNodeError(errors.invalidContentType(node.name), node)
      }
      this.baseNodeError(errors.invalidMessageRole(node.name), node)
    }

    this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
  }

  private buildMessage({
    node,
    role,
    attributes,
    content,
    toolCalls,
  }: {
    node: ElementTag
    role: MessageRole
    attributes: Record<string, unknown>
    content: MessageContent[]
    toolCalls: ToolCall[]
  }): Message {
    if (toolCalls.length > 0 && role !== MessageRole.assistant) {
      this.baseNodeError(errors.invalidTagPlacement(TOOL_CALL_TAG, role), node)
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
        toolCalls,
        content,
      } as AssistantMessage
    }

    if (role === MessageRole.tool) {
      if (attributes.id === undefined) {
        this.baseNodeError(errors.toolMessageWithoutId, node)
      }

      return {
        role,
        id: String(attributes.id),
        content,
      } as ToolMessage
    }

    this.baseNodeError(errors.invalidMessageRole(role), node)
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
