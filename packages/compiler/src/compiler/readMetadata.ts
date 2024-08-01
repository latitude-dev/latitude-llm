import {
  CUSTOM_MESSAGE_ROLE_ATTR,
  CUSTOM_MESSAGE_TAG,
  REFERENCE_DEPTH_LIMIT,
  REFERENCE_PROMPT_ATTR,
  REFERENCE_PROMPT_TAG,
} from '$compiler/constants'
import CompileError, { error } from '$compiler/error/error'
import errors from '$compiler/error/errors'
import parse from '$compiler/parser/index'
import type {
  Attribute,
  BaseNode,
  ElementTag,
  Fragment,
  TemplateNode,
  ToolCallTag,
} from '$compiler/parser/interfaces'
import { Config, ConversationMetadata, MessageRole } from '$compiler/types'
import { Node as LogicalExpression } from 'estree'
import yaml from 'yaml'

import { readConfig } from './config'
import { updateScopeContextForNode } from './logic'
import { ScopeContext } from './scope'
import {
  isChainStepTag,
  isContentTag,
  isMessageTag,
  isRefTag,
  isToolCallTag,
} from './utils'

function copyScopeContext(scopeContext: ScopeContext): ScopeContext {
  return {
    ...scopeContext,
    definedVariables: new Set(scopeContext.definedVariables),
  }
}

export type Document = {
  path: string
  content: string
}
export type ReferencePromptFn = (
  path: string,
  from?: string,
) => Promise<Document | undefined>

export class ReadMetadata {
  private rawText: string
  private referenceFn?: ReferencePromptFn
  private fullPath: string

  private resolvedPrompt: string
  private resolvedPromptOffset: number = 0

  private accumulatedToolCalls: ToolCallTag[] = []
  private errors: CompileError[] = []

  private references: { [from: string]: string[] } = {}
  private referenceDepth: number = 0

  constructor({
    document,
    referenceFn,
  }: {
    document: Document
    referenceFn?: ReferencePromptFn
    configSchema?: object
  }) {
    this.rawText = document.content
    this.referenceFn = referenceFn
    this.fullPath = document.path

    this.resolvedPrompt = document.content
  }

  async run(): Promise<ConversationMetadata> {
    const scopeContext = {
      usedUndefinedVariables: new Set<string>(),
      definedVariables: new Set<string>(),
    }

    let fragment: Fragment
    let config: Config = {}

    try {
      fragment = parse(this.rawText)
    } catch (e) {
      const parseError = e as CompileError
      if (parseError instanceof CompileError) {
        this.errors.push(parseError)
        fragment = parseError.fragment!
      } else {
        throw parseError
      }
    }

    await this.readBaseMetadata({
      node: fragment,
      scopeContext,
      isInsideMessageTag: false,
      isInsideContentTag: false,
    })

    config = readConfig(fragment)
    let resolvedPrompt = this.resolvedPrompt
    if (Object.keys(config).length > 0) {
      const configYaml = yaml.stringify(config)
      resolvedPrompt = `---\n${configYaml}---\n${this.resolvedPrompt}`
    }

    return {
      parameters: scopeContext.usedUndefinedVariables,
      resolvedPrompt,
      config,
      errors: this.errors,
    }
  }

  private async updateScopeContext({
    node,
    scopeContext,
  }: {
    node: LogicalExpression
    scopeContext: ScopeContext
  }): Promise<void> {
    await updateScopeContextForNode({
      node,
      scopeContext,
      raiseError: this.expressionError.bind(this),
    })
  }

  private async listTagAttributes({
    tagNode,
    scopeContext,
    literalAttributes = [], // Tags that don't allow Mustache expressions
  }: {
    tagNode: ElementTag
    scopeContext: ScopeContext
    literalAttributes?: string[]
  }): Promise<Set<string>> {
    const attributeNodes = tagNode.attributes
    if (attributeNodes.length === 0) return new Set()

    const attributes: Set<string> = new Set()
    for (const attributeNode of attributeNodes) {
      const { name, value } = attributeNode
      if (value === true) {
        attributes.add(name)
        continue
      }

      if (literalAttributes.includes(name)) {
        if (value.some((node) => node.type === 'MustacheTag')) {
          this.baseNodeError(
            errors.invalidStaticAttribute(name),
            value.find((node) => node.type === 'MustacheTag')!,
          )
          continue
        }
      }

      for await (const node of value) {
        if (node.type === 'MustacheTag') {
          const expression = node.expression
          await this.updateScopeContext({ node: expression, scopeContext })
        }
      }

      attributes.add(name)
    }

    return attributes
  }

  private async readBaseMetadata({
    node,
    scopeContext,
    isInsideMessageTag,
    isInsideContentTag,
  }: {
    node: TemplateNode
    scopeContext: ScopeContext
    isInsideMessageTag: boolean
    isInsideContentTag: boolean
  }): Promise<void> {
    if (node.type === 'Fragment') {
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'Config' || node.type === 'Comment') {
      /* Remove from the resolved prompt */
      const start = node.start! + this.resolvedPromptOffset
      const end = node.end! + this.resolvedPromptOffset
      this.resolvedPrompt =
        this.resolvedPrompt.slice(0, start) + this.resolvedPrompt.slice(end)
      this.resolvedPromptOffset -= end - start
      return
    }

    if (node.type === 'Text') {
      /* do nothing */
      return
    }

    if (node.type === 'MustacheTag') {
      const expression = node.expression
      await this.updateScopeContext({ node: expression, scopeContext })
      return
    }

    if (node.type === 'IfBlock') {
      const ifScope = copyScopeContext(scopeContext)
      const elseScope = copyScopeContext(scopeContext)
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: ifScope,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      for await (const childNode of node.else?.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: elseScope,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'EachBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })

      const elseScope = copyScopeContext(scopeContext)
      for await (const childNode of node.else?.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: elseScope,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }

      const contextVarName = node.context.name
      const indexVarName = node.index?.name
      if (scopeContext.definedVariables.has(contextVarName)) {
        this.expressionError(
          errors.variableAlreadyDeclared(contextVarName),
          node.context,
        )
        return
      }
      if (indexVarName && scopeContext.definedVariables.has(indexVarName)) {
        this.expressionError(
          errors.variableAlreadyDeclared(indexVarName),
          node.index!,
        )
        return
      }

      const iterableScope = copyScopeContext(scopeContext)
      iterableScope.definedVariables.add(contextVarName)
      if (indexVarName) {
        iterableScope.definedVariables.add(indexVarName)
      }
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: iterableScope,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'ElementTag') {
      if (isToolCallTag(node)) {
        if (isInsideContentTag) {
          this.baseNodeError(errors.toolCallTagInsideContent, node)
          return
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
        })

        if (!attributes.has('id')) {
          this.baseNodeError(errors.toolCallTagWithoutId, node)
          return
        }

        if (!attributes.has('name')) {
          this.baseNodeError(errors.toolCallWithoutName, node)
          return
        }

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideMessageTag,
            isInsideContentTag: true,
          })
        }

        this.accumulatedToolCalls.push(node as ToolCallTag)
        return
      }

      if (isContentTag(node)) {
        if (isInsideContentTag) {
          this.baseNodeError(errors.contentTagInsideContent, node)
          return
        }

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideMessageTag,
            isInsideContentTag: true,
          })
        }
        return
      }

      if (isMessageTag(node)) {
        if (isInsideContentTag || isInsideMessageTag) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
          return
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
        })

        const role = node.name as MessageRole
        if (node.name === CUSTOM_MESSAGE_TAG) {
          if (!attributes.has(CUSTOM_MESSAGE_ROLE_ATTR)) {
            this.baseNodeError(errors.messageTagWithoutRole, node)
            return
          }
          attributes.delete(CUSTOM_MESSAGE_ROLE_ATTR)
        }

        if (role === MessageRole.tool && !attributes.has('id')) {
          this.baseNodeError(errors.toolMessageWithoutId, node)
          return
        }

        if (this.accumulatedToolCalls.length > 0) {
          this.accumulatedToolCalls.forEach((toolCallNode) => {
            this.baseNodeError(errors.invalidToolCallPlacement, toolCallNode)
            return
          })
        }
        this.accumulatedToolCalls = []

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideMessageTag: true,
            isInsideContentTag,
          })
        }

        if (
          role !== MessageRole.assistant &&
          this.accumulatedToolCalls.length > 0
        ) {
          this.accumulatedToolCalls.forEach((toolCallNode) => {
            this.baseNodeError(errors.invalidToolCallPlacement, toolCallNode)
            return
          })
        }
        this.accumulatedToolCalls = []
        return
      }

      if (isRefTag(node)) {
        if (node.children?.length ?? 0 > 0) {
          this.baseNodeError(errors.referenceTagHasContent, node)
          return
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
          literalAttributes: [REFERENCE_PROMPT_ATTR],
        })

        if (!attributes.has(REFERENCE_PROMPT_ATTR)) {
          this.baseNodeError(errors.referenceTagWithoutPrompt, node)
          return
        }

        if (!this.referenceFn) {
          this.baseNodeError(errors.missingReferenceFunction, node)
          return
        }

        if (this.referenceDepth > REFERENCE_DEPTH_LIMIT) {
          this.baseNodeError(errors.referenceDepthLimit, node)
          return
        }

        const refPromptAttribute = node.attributes.find(
          (attribute: Attribute) => attribute.name === REFERENCE_PROMPT_ATTR,
        ) as Attribute

        const refPromptPath = (refPromptAttribute.value as TemplateNode[])
          .map((node) => node.data)
          .join('')

        let resolvedRefPrompt = `/* <${REFERENCE_PROMPT_TAG} ${REFERENCE_PROMPT_ATTR}="${refPromptPath}" /> */`
        const currentReferences = this.references[this.fullPath] ?? []

        const resolveRef = async () => {
          if (!this.referenceFn) {
            this.baseNodeError(errors.missingReferenceFunction, node)
            return
          }

          if (currentReferences.includes(refPromptPath)) {
            this.baseNodeError(errors.circularReference, node)
            return
          }

          const refDocument = await this.referenceFn(
            refPromptPath,
            this.fullPath,
          )

          if (!refDocument) {
            this.baseNodeError(errors.referenceNotFound, node)
            return
          }

          const refReadMetadata = new ReadMetadata({
            document: refDocument,
            referenceFn: this.referenceFn,
          })
          refReadMetadata.accumulatedToolCalls = this.accumulatedToolCalls
          refReadMetadata.references = {
            ...this.references,
            [this.fullPath]: [...currentReferences, refPromptPath],
          }
          refReadMetadata.referenceDepth = this.referenceDepth + 1

          const refPromptMetadata = await refReadMetadata.run()
          refPromptMetadata.parameters.forEach((param: string) => {
            if (!scopeContext.definedVariables.has(param)) {
              scopeContext.usedUndefinedVariables.add(param)
            }
          })
          refPromptMetadata.errors.forEach((error: CompileError) => {
            if (
              error.code === 'reference-error' ||
              error.code === 'circular-reference'
            ) {
              this.baseNodeError(
                { code: error.code, message: error.message },
                node,
              )
              return
            }
            this.baseNodeError(errors.referenceError(error), node)
          })
          this.accumulatedToolCalls = refReadMetadata.accumulatedToolCalls
          resolvedRefPrompt = refReadMetadata.resolvedPrompt
        }

        try {
          await resolveRef()
        } catch (error: unknown) {
          this.baseNodeError(errors.referenceError(error), node)
        }

        /* Replace the reference tag with the actual referenced prompt */
        const start = node.start! + this.resolvedPromptOffset
        const end = node.end! + this.resolvedPromptOffset
        const pretext = this.resolvedPrompt.slice(0, start)
        const posttext = this.resolvedPrompt.slice(end)
        this.resolvedPrompt = pretext + resolvedRefPrompt + posttext
        this.resolvedPromptOffset += resolvedRefPrompt.length - (end - start)

        return
      }

      if (isChainStepTag(node)) {
        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
          literalAttributes: ['as'],
        })

        if (attributes.has('as')) {
          const asAttribute = node.attributes.find((a) => a.name === 'as')!
          const asValue = (asAttribute.value as TemplateNode[])
            .map((n) => n.value)
            .join('')

          scopeContext.definedVariables.add(asValue)
        }

        return
      }

      this.baseNodeError(errors.unknownTag(node.name), node)
      return
    }

    //@ts-ignore - Linter knows this should be unreachable. That's what this error is for.
    this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
  }

  private baseNodeError(
    { code, message }: { code: string; message: string },
    node: BaseNode,
  ): void {
    try {
      error(message, {
        name: 'CompileError',
        code,
        source: this.rawText || '',
        start: node.start || 0,
        end: node.end || undefined,
      })
    } catch (error) {
      this.errors.push(error as CompileError)
    }
  }

  private expressionError(
    { code, message }: { code: string; message: string },
    node: LogicalExpression,
  ): void {
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

    try {
      error(message, {
        name: 'CompileError',
        code,
        source: this.rawText || '',
        start,
        end,
      })
    } catch (error) {
      this.errors.push(error as CompileError)
    }
  }
}
