import { createHash } from 'crypto'

import {
  CUSTOM_MESSAGE_ROLE_ATTR,
  REFERENCE_DEPTH_LIMIT,
  REFERENCE_PROMPT_ATTR,
  TAG_NAMES,
} from '$promptl/constants'
import CompileError, { error } from '$promptl/error/error'
import errors from '$promptl/error/errors'
import parse from '$promptl/parser/index'
import type {
  Attribute,
  BaseNode,
  ContentTag,
  ElementTag,
  Fragment,
  TemplateNode,
} from '$promptl/parser/interfaces'
import {
  Config,
  ContentTypeTagName,
  ConversationMetadata,
  MessageRole,
} from '$promptl/types'
import { Node as LogicalExpression } from 'estree'
import yaml, { Node as YAMLItem } from 'yaml'
import { z } from 'zod'

import { updateScopeContextForNode } from './logic'
import { ScopeContext } from './scope'
import { Document, ReferencePromptFn } from './types'
import {
  findYAMLItemPosition,
  isChainStepTag,
  isContentTag,
  isMessageTag,
  isRefTag,
} from './utils'

function copyScopeContext(scopeContext: ScopeContext): ScopeContext {
  return {
    ...scopeContext,
    definedVariables: new Set(scopeContext.definedVariables),
  }
}

export class ReadMetadata {
  private rawText: string
  private referenceFn?: ReferencePromptFn
  private fullPath: string
  private withParameters?: string[]
  private configSchema?: z.ZodType

  private config?: Config
  private configPosition?: { start: number; end: number }
  private hasContent: boolean = false

  private accumulatedToolCalls: ContentTag[] = []
  private errors: CompileError[] = []

  private references: { [from: string]: string[] } = {}
  private referencedHashes: string[] = []
  private referenceDepth: number = 0

  constructor({
    document,
    referenceFn,
    withParameters,
    configSchema,
  }: {
    document: Document
    referenceFn?: ReferencePromptFn
    withParameters?: string[]
    configSchema?: z.ZodType
  }) {
    this.rawText = document.content
    this.referenceFn = referenceFn
    this.fullPath = document.path
    this.withParameters = withParameters
    this.configSchema = configSchema
  }

  async run(): Promise<ConversationMetadata> {
    const scopeContext = {
      onlyPredefinedVariables: this.withParameters
        ? new Set(this.withParameters)
        : undefined,
      usedUndefinedVariables: new Set<string>(),
      definedVariables: new Set<string>(),
    }

    let fragment: Fragment

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
      isInsideStepTag: false,
      isInsideMessageTag: false,
      isInsideContentTag: false,
      isRoot: true,
    })

    if (this.configSchema && !this.config) {
      this.baseNodeError(errors.missingConfig, fragment, { start: 0, end: 0 })
    }

    const setConfig = (config: Config) => {
      const start = this.configPosition?.start ?? 0
      const end = this.configPosition?.end ?? 0

      if (Object.keys(config).length === 0) {
        return this.rawText.slice(0, start) + this.rawText.slice(end)
      }

      return (
        this.rawText.slice(0, start) +
        '---\n' +
        yaml.stringify(config, { indent: 2 }) +
        '---\n' +
        this.rawText.slice(end)
      )
    }

    const contentToHash = [this.rawText, ...this.referencedHashes].join('')
    const hash = createHash('sha256').update(contentToHash).digest('hex')

    return {
      parameters: new Set([
        ...scopeContext.usedUndefinedVariables,
        ...(scopeContext.onlyPredefinedVariables ?? new Set([])),
      ]),
      hash,
      config: this.config ?? {},
      errors: this.errors,
      setConfig,
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
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    isRoot = false,
  }: {
    node: TemplateNode
    scopeContext: ScopeContext
    isInsideStepTag: boolean
    isInsideMessageTag: boolean
    isInsideContentTag: boolean
    isRoot?: boolean
  }): Promise<void> {
    if (node.type === 'Fragment') {
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
          isRoot,
        })
      }
      return
    }

    if (node.type === 'Comment') {
      // do nothing
    }

    if (node.type === 'Config') {
      if (this.config) {
        this.baseNodeError(errors.configAlreadyDeclared, node)
      }
      if (!isRoot) {
        this.baseNodeError(errors.configOutsideRoot, node)
      }
      if (this.hasContent) {
        this.baseNodeError(errors.invalidConfigPlacement, node)
      }

      this.configPosition = { start: node.start!, end: node.end! }

      const parsedYaml = yaml.parseDocument(node.value, {
        keepSourceTokens: true,
      })

      const CONFIG_START_OFFSET = 3 // The config is always offsetted by 3 characters due to the `---`

      if (parsedYaml.errors.length) {
        parsedYaml.errors.forEach((error) => {
          const [errorStart, errorEnd] = error.pos
          this.baseNodeError(errors.invalidConfig(error.message), node, {
            start: node.start! + CONFIG_START_OFFSET + errorStart,
            end: node.start! + CONFIG_START_OFFSET + errorEnd,
          })
        })
      }

      const parsedObj = parsedYaml.toJS() ?? {}

      try {
        this.configSchema?.parse(parsedObj)
      } catch (err) {
        if (err instanceof z.ZodError) {
          err.errors.forEach((error) => {
            const issue = error.message

            const range = findYAMLItemPosition(
              parsedYaml.contents as YAMLItem,
              error.path,
            )

            const errorStart = range
              ? node.start! + CONFIG_START_OFFSET + range[0]
              : node.start!
            const errorEnd = range
              ? node.start! + CONFIG_START_OFFSET + range[1] + 1
              : node.end!

            this.baseNodeError(errors.invalidConfig(issue), node, {
              start: errorStart,
              end: errorEnd,
            })
          })
        }
      }

      this.config = parsedObj
      return
    }

    if (node.type === 'Text') {
      if (node.data.trim()) {
        this.hasContent = true
      }
      /* do nothing */
      return
    }

    if (node.type === 'Comment') {
      /* do nothing */
      return
    }

    if (node.type === 'MustacheTag') {
      this.hasContent = true
      const expression = node.expression
      await this.updateScopeContext({ node: expression, scopeContext })
      return
    }

    if (node.type === 'IfBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })
      const ifScope = copyScopeContext(scopeContext)
      const elseScope = copyScopeContext(scopeContext)
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: ifScope,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      for await (const childNode of node.else?.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: elseScope,
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'ForBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })

      const elseScope = copyScopeContext(scopeContext)
      for await (const childNode of node.else?.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: elseScope,
          isInsideStepTag,
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
          isInsideStepTag,
          isInsideMessageTag,
          isInsideContentTag,
        })
      }
      return
    }

    if (node.type === 'ElementTag') {
      this.hasContent = true

      if (isContentTag(node)) {
        if (isInsideContentTag) {
          this.baseNodeError(errors.contentTagInsideContent, node)
        }

        if (node.name === ContentTypeTagName.toolCall) {
          this.accumulatedToolCalls.push(node)

          const attributes = await this.listTagAttributes({
            tagNode: node,
            scopeContext,
          })

          if (!attributes.has('id')) {
            this.baseNodeError(errors.toolCallTagWithoutId, node)
          }

          if (!attributes.has('name')) {
            this.baseNodeError(errors.toolCallWithoutName, node)
          }
        }

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideStepTag,
            isInsideMessageTag,
            isInsideContentTag: true,
          })
        }
        return
      }

      if (isMessageTag(node)) {
        if (isInsideContentTag || isInsideMessageTag) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
        })

        const role = node.name as MessageRole
        if (node.name === TAG_NAMES.message) {
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
            isInsideStepTag,
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

        attributes.delete(REFERENCE_PROMPT_ATTR) // The rest of the attributes are used as parameters

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
          refPromptMetadata.parameters.forEach((paramName: string) => {
            if (!attributes.has(paramName)) {
              this.baseNodeError(
                errors.referenceMissingParameter(paramName),
                node,
              )
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
          this.referencedHashes.push(refPromptMetadata.hash)
        }

        try {
          await resolveRef()
        } catch (error: unknown) {
          this.baseNodeError(errors.referenceError(error), node)
        }

        return
      }

      if (isChainStepTag(node)) {
        if (isInsideStepTag) {
          this.baseNodeError(errors.stepTagInsideStep, node)
        }

        const attributes = await this.listTagAttributes({
          tagNode: node,
          scopeContext,
          literalAttributes: ['as'],
        })

        for await (const childNode of node.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext,
            isInsideStepTag: true,
            isInsideMessageTag: true,
            isInsideContentTag,
          })
        }

        if (attributes.has('as')) {
          const asAttribute = node.attributes.find((a) => a.name === 'as')!
          if (asAttribute.value !== true) {
            const asValue = asAttribute.value.map((n) => n.data).join('')
            scopeContext.definedVariables.add(asValue)
          }
        }

        return
      }

      // Should not be reachable, as non-recognized tags are caught by the parser
      this.baseNodeError(errors.unknownTag(node.name), node)
      return
    }

    //@ts-ignore - Linter knows this should be unreachable. That's what this error is for.
    this.baseNodeError(errors.unsupportedBaseNodeType(node.type), node)
  }

  private baseNodeError(
    { code, message }: { code: string; message: string },
    node: BaseNode,
    customPos?: { start: number; end: number },
  ): void {
    try {
      error(message, {
        name: 'CompileError',
        code,
        source: this.rawText || '',
        start: customPos?.start || node.start || 0,
        end: customPos?.end || node.end || undefined,
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
