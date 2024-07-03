import type { Node } from 'estree'

import {
  CUSTOM_MESSAGE_ROLE_ATTR,
  CUSTOM_MESSAGE_TAG,
  REFERENCE_PROMPT_ATTR,
  REFERENCE_PROMPT_TAG,
} from '../constants'
import CompileError, { error } from '../error/error'
import errors from '../error/errors'
import parse from '../parser/index'
import type {
  BaseNode,
  EachBlock,
  ElementTag,
  IfBlock,
  TemplateNode,
} from '../parser/interfaces'
import {
  ContentType,
  Conversation,
  Message,
  MessageContent,
  MessageRole,
} from '../types'
import { readConfig } from './config'
import { resolveLogicNode } from './logic'
import Scope from './scope'
import { hasContent, isIterable, removeCommonIndent } from './utils'

export type ReferencePromptFn = (prompt: string) => Promise<string>

export class Compile {
  private rawText: string
  private parameters: Record<string, unknown>
  private referenceFn?: ReferencePromptFn

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
    this.parameters = parameters
    this.referenceFn = referenceFn
  }

  /**
   * Resolves every block, expression, and function inside the SQL and returns the final query.
   *
   * Note: Compiling a query may take time in some cases, as some queries may contain expensive
   * functions that need to be resolved at runtime.
   */
  async run(): Promise<Conversation> {
    const fragment = parse(this.rawText)
    const config = readConfig(fragment)
    const messages = await this.extractMessages({
      nodes: fragment.children,
      scope: new Scope(this.parameters),
    })

    return {
      config,
      messages,
    }
  }

  private async resolveExpression(
    expression: Node,
    scope: Scope,
  ): Promise<unknown> {
    return await resolveLogicNode({
      node: expression,
      scope,
      raiseError: this.expressionError.bind(this),
    })
  }

  private async resolveIfBlock({
    node,
    scope,
    onTrue,
    onFalse,
  }: {
    node: IfBlock
    scope: Scope
    onTrue: () => Promise<void>
    onFalse: () => Promise<void>
  }) {
    const condition = await this.resolveExpression(node.expression, scope)
    if (condition) {
      await onTrue()
    } else {
      await onFalse()
    }
  }

  private async resolveEachBlock({
    node,
    scope,
    onEach,
    onEmpty,
  }: {
    node: EachBlock
    scope: Scope
    onEach: (localScope: Scope) => Promise<void>
    onEmpty: () => Promise<void>
  }) {
    const iterableElement = await this.resolveExpression(node.expression, scope)
    if (!isIterable(iterableElement) || !(await hasContent(iterableElement))) {
      await onEmpty()
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
      if (indexVarName) {
        localScope.set(indexVarName, i)
      }
      localScope.set(contextVarName, element)
      await onEach(localScope)
      i++
    }
  }

  /**
   * Obtains the text content from inside a ContentTag or an Attribute
   */
  private async extractTextContent({
    nodes,
    scope,
  }: {
    nodes: TemplateNode[]
    scope: Scope
  }): Promise<string> {
    let text: string = ''

    for await (const node of nodes) {
      if (node.type === 'Config' || node.type === 'Comment') {
        /* do nothing */
        continue
      }

      if (node.type === 'Text') {
        text += node.data
        continue
      }

      if (node.type === 'MustacheTag') {
        const expression = node.expression
        const value = await this.resolveExpression(expression, scope)
        if (value === undefined) continue
        text += String(value)
        continue
      }

      if (node.type === 'IfBlock') {
        await this.resolveIfBlock({
          node: node as IfBlock,
          scope,
          onTrue: async () => {
            text += await this.extractTextContent({
              nodes: node.children ?? [],
              scope: scope.copy(),
            })
          },
          onFalse: async () => {
            text += await this.extractTextContent({
              nodes: node.else?.children ?? [],
              scope: scope.copy(),
            })
          },
        })
        continue
      }

      if (node.type === 'EachBlock') {
        await this.resolveEachBlock({
          node: node as EachBlock,
          scope,
          onEach: async (localScope) => {
            text += await this.extractTextContent({
              nodes: node.children ?? [],
              scope: localScope,
            })
          },
          onEmpty: async () => {
            text += await this.extractTextContent({
              nodes: node.else?.children ?? [],
              scope: scope.copy(),
            })
          },
        })
        continue
      }

      if (node.type === 'ElementTag') {
        const tagName = node.name
        this.baseNodeError(errors.invalidTagPlacement(tagName, 'content'), node)
      }

      this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
    }

    return text
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

      const resolvedValue = await this.extractTextContent({
        nodes: value,
        scope: scope,
      })

      attributes[name] = resolvedValue
    }

    return attributes
  }

  /**
   * Obtains a list of contents from inside a MessageTag.
   */
  private async extractMessageContent({
    nodes,
    scope,
    strayText = { accumulatedValue: null },
  }: {
    nodes: TemplateNode[]
    scope: Scope
    strayText?: { accumulatedValue: string | null } // Textable nodes that are inside the message but are not inside a ContentTag
  }): Promise<MessageContent[]> {
    const messageContent: MessageContent[] = []

    const addStrayText = (text: string) => {
      if (strayText.accumulatedValue === null) strayText.accumulatedValue = ''
      strayText.accumulatedValue += text
    }
    const storeStrayText = () => {
      if (strayText.accumulatedValue === null) return
      if (strayText.accumulatedValue.trim() !== '') {
        messageContent.push({
          type: ContentType.text,
          value: removeCommonIndent(strayText.accumulatedValue),
        })
      }
      strayText.accumulatedValue = null
    }

    for await (const node of nodes) {
      if (node.type === 'Config' || node.type === 'Comment') {
        /* do nothing */
        continue
      }

      if (node.type === 'Text') {
        addStrayText(node.data)
        continue
      }

      if (node.type === 'MustacheTag') {
        const expression = node.expression
        const value = await this.resolveExpression(expression, scope)
        if (value === undefined) continue
        addStrayText(String(value))
        continue
      }

      if (node.type === 'IfBlock') {
        await this.resolveIfBlock({
          node: node as IfBlock,
          scope,
          onTrue: async () => {
            const childMessageContent = await this.extractMessageContent({
              nodes: node.children ?? [],
              scope: scope.copy(),
              strayText: strayText,
            })
            messageContent.push(...childMessageContent)
          },
          onFalse: async () => {
            const childMessageContent = await this.extractMessageContent({
              nodes: node.else?.children ?? [],
              scope: scope.copy(),
              strayText: strayText,
            })
            messageContent.push(...childMessageContent)
          },
        })
        continue
      }

      if (node.type === 'EachBlock') {
        await this.resolveEachBlock({
          node: node as EachBlock,
          scope,
          onEach: async (localScope) => {
            const childMessageContent = await this.extractMessageContent({
              nodes: node.children ?? [],
              scope: localScope,
              strayText: strayText,
            })
            messageContent.push(...childMessageContent)
          },
          onEmpty: async () => {
            const childMessageContent = await this.extractMessageContent({
              nodes: node.else?.children ?? [],
              scope: scope.copy(),
              strayText: strayText,
            })
            messageContent.push(...childMessageContent)
          },
        })
        continue
      }

      if (node.type === 'ElementTag') {
        if (Object.values(MessageRole).includes(node.name)) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
        }
        if (!Object.values(ContentType).includes(node.name)) {
          this.baseNodeError(errors.invalidContentType(node.name), node)
        }

        storeStrayText()

        const contentType = node.name as ContentType
        const content = await this.extractTextContent({
          nodes: node.children ?? [],
          scope: scope.copy(),
        })
        messageContent.push({
          type: contentType,
          value: removeCommonIndent(content),
        })
        continue
      }

      this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
    }

    storeStrayText()
    return messageContent
  }

  /**
   * Obtains a list of messages from the root nodes.
   */
  private async extractMessages({
    nodes,
    scope,
    strayNodes = { messageContents: [], text: null },
  }: {
    nodes: TemplateNode[]
    scope: Scope
    strayNodes?: { messageContents: MessageContent[]; text: string | null } // Nodes that do have content but are not inside a MessageTag
  }): Promise<Message[]> {
    const messages: Message[] = []

    const addStrayText = (text: string) => {
      if (strayNodes.text === null) strayNodes.text = ''
      strayNodes.text += text
    }
    const storeStrayTextAsStrayMessageContent = () => {
      if (strayNodes.text === null) return
      if (strayNodes.text.trim() !== '') {
        strayNodes.messageContents.push({
          type: ContentType.text,
          value: removeCommonIndent(strayNodes.text),
        })
      }
      strayNodes.text = null
    }
    const addStrayMessageContent = (messageContent: MessageContent) => {
      storeStrayTextAsStrayMessageContent()
      strayNodes.messageContents.push(messageContent)
    }
    const storeStrayContentAsMessage = async () => {
      storeStrayTextAsStrayMessageContent()
      if (strayNodes.messageContents.length === 0) return
      messages.push({
        role: MessageRole.system,
        content: strayNodes.messageContents,
      })
      strayNodes.messageContents = []
    }

    for (const node of nodes) {
      if (node.type === 'Config' || node.type === 'Comment') {
        /* do nothing */
        continue
      }

      if (node.type === 'Text') {
        addStrayText(node.data)
        continue
      }

      if (node.type === 'MustacheTag') {
        const expression = node.expression
        const value = await this.resolveExpression(expression, scope)
        if (value === undefined) continue
        addStrayText(String(value))
        continue
      }

      if (node.type === 'ElementTag') {
        let tagName = node.name

        if (Object.values(ContentType).includes(tagName)) {
          const textContent = await this.extractTextContent({
            nodes: node.children ?? [],
            scope: scope.copy(),
          })
          const messageContent: MessageContent = {
            type: tagName,
            value: textContent,
          }
          addStrayMessageContent(messageContent)
          continue
        }

        if (tagName === REFERENCE_PROMPT_TAG) {
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

          storeStrayContentAsMessage()

          const refPromptPath = attributes[REFERENCE_PROMPT_ATTR]
          try {
            const refPrompt = await this.referenceFn(refPromptPath)
            const refPromptConversation = await new Compile({
              prompt: refPrompt,
              parameters: this.parameters,
            }).run()
            messages.push(...refPromptConversation.messages)
          } catch (error: unknown) {
            if (error instanceof CompileError) throw error
            this.baseNodeError(errors.referenceError(error), node)
          }
          continue
        }

        if (
          tagName === CUSTOM_MESSAGE_TAG ||
          Object.values(MessageRole).includes(tagName)
        ) {
          const attributes = await this.resolveTagAttributes({
            tagNode: node as ElementTag,
            scope,
          })

          let role = tagName
          if (tagName === CUSTOM_MESSAGE_TAG) {
            if (attributes[CUSTOM_MESSAGE_ROLE_ATTR] === undefined) {
              this.baseNodeError(errors.messageTagWithoutRole, node)
            }
            role = attributes[CUSTOM_MESSAGE_ROLE_ATTR]
            delete attributes[CUSTOM_MESSAGE_ROLE_ATTR]

            if (!Object.values(MessageRole).includes(role)) {
              this.baseNodeError(errors.invalidMessageRole(role), node)
            }
          }

          const messageContent = await this.extractMessageContent({
            nodes: node.children ?? [],
            scope: scope.copy(),
          })

          storeStrayContentAsMessage()
          messages.push({
            role,
            content: messageContent,
          })
          continue
        }

        this.baseNodeError(errors.invalidMessageRole(tagName), node)
      }

      if (node.type === 'IfBlock') {
        await this.resolveIfBlock({
          node: node as IfBlock,
          scope,
          onTrue: async () => {
            const childMessages = await this.extractMessages({
              nodes: node.children ?? [],
              scope: scope.copy(),
              strayNodes,
            })
            messages.push(...childMessages)
          },
          onFalse: async () => {
            const childMessages = await this.extractMessages({
              nodes: node.else?.children ?? [],
              scope: scope.copy(),
              strayNodes,
            })
            messages.push(...childMessages)
          },
        })
        continue
      }

      if (node.type === 'EachBlock') {
        await this.resolveEachBlock({
          node: node as EachBlock,
          scope,
          onEach: async (localScope) => {
            const childMessages = await this.extractMessages({
              nodes: node.children ?? [],
              scope: localScope,
              strayNodes,
            })
            messages.push(...childMessages)
          },
          onEmpty: async () => {
            const elseMessages = await this.extractMessages({
              nodes: node.else?.children ?? [],
              scope: scope.copy(),
              strayNodes,
            })
            messages.push(...elseMessages)
          },
        })
        continue
      }

      this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
    }

    storeStrayContentAsMessage()
    return messages
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
    node: Node,
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
