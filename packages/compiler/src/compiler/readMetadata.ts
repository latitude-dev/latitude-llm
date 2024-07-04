import { createHash } from 'crypto'

import {
  CUSTOM_MESSAGE_TAG,
  REFERENCE_PROMPT_ATTR,
  REFERENCE_PROMPT_TAG,
} from '$/constants'
import CompileError, { error } from '$/error/error'
import errors from '$/error/errors'
import parse from '$/parser/index'
import type { Attribute, BaseNode } from '$/parser/interfaces'
import { ContentType, ConversationMetadata, MessageRole } from '$/types'
import { Node as LogicalExpression } from 'estree'

import { ReferencePromptFn } from './compile'
import { readConfig, validateConfig } from './config'
import { updateScopeContextForNode } from './logic'
import { ScopeContext } from './scope'

function copyScopeContext(scopeContext: ScopeContext): ScopeContext {
  return {
    ...scopeContext,
    definedVariables: new Set(scopeContext.definedVariables),
  }
}

export class ReadMetadata {
  private rawText: string
  private referenceFn?: ReferencePromptFn
  private configSchema?: object

  private referencedPrompts: Record<string, string> = {} // Prompt path -> Prompt hash

  constructor({
    prompt,
    referenceFn,
    configSchema,
  }: {
    prompt: string
    referenceFn?: ReferencePromptFn
    configSchema?: object
  }) {
    this.rawText = prompt
    this.referenceFn = referenceFn
    this.configSchema = configSchema
  }

  /**
   * Resolves every block, expression, and function inside the SQL and returns the final query.
   *
   * Note: Compiling a query may take time in some cases, as some queries may contain expensive
   * functions that need to be resolved at runtime.
   */
  async run(): Promise<ConversationMetadata<typeof this.configSchema>> {
    const fragment = parse(this.rawText)
    const config = readConfig<typeof this.configSchema>(fragment)
    const scopeContext = {
      usedUndefinedVariables: new Set<string>(),
      definedVariables: new Set<string>(),
    }
    await this.readBaseMetadata({
      node: fragment,
      scopeContext,
      isInMessageTag: false,
      isInContentTag: false,
    })

    const hash = createHash('sha256')
    hash.update(this.rawText)
    Object.values(this.referencedPrompts).forEach((refHash: string) => {
      hash.update(refHash)
    })
    const hashValue = hash.digest('hex')

    return {
      hash: hashValue,
      parameters: scopeContext.usedUndefinedVariables,
      referencedPrompts: new Set(Object.keys(this.referencedPrompts)),
      schemaValidation: this.configSchema
        ? validateConfig(config as object, this.configSchema as object)
        : undefined,
      config,
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

  private async readBaseMetadata({
    node,
    scopeContext,
    isInMessageTag,
    isInContentTag,
  }: {
    node: BaseNode
    scopeContext: ScopeContext
    isInMessageTag: boolean
    isInContentTag: boolean
  }): Promise<void> {
    if (node.type === 'Fragment') {
      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext,
          isInMessageTag,
          isInContentTag,
        })
      }
      return
    }

    if (
      node.type === 'Config' ||
      node.type === 'Comment' ||
      node.type === 'Text'
    ) {
      /* do nothing */
      return
    }

    if (node.type === 'MustacheTag') {
      await this.updateScopeContext({ node: node.expression, scopeContext })
    }

    if (node.type === 'IfBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })

      for await (const childNode of node.children ?? []) {
        await this.readBaseMetadata({
          node: childNode,
          scopeContext: copyScopeContext(scopeContext),
          isInMessageTag,
          isInContentTag,
        })
      }
      if (node.else) {
        for await (const childNode of node.else.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext: copyScopeContext(scopeContext),
            isInMessageTag,
            isInContentTag,
          })
        }
      }
      return
    }

    if (node.type === 'EachBlock') {
      await this.updateScopeContext({ node: node.expression, scopeContext })
      await this.updateScopeContext({ node: node.context, scopeContext })
      const contextVarName = node.context.name
      const indexVarName = node.index === null ? null : node.index.name

      if (node.index) {
        await this.updateScopeContext({ node: node.index, scopeContext })
      }
      if (node.key) {
        const keyScopeContext = copyScopeContext(scopeContext)
        keyScopeContext.definedVariables.add(contextVarName)
        await this.updateScopeContext({ node: node.key, scopeContext })
      }

      for await (const childNode of node.children ?? []) {
        const childScopeContext = copyScopeContext(scopeContext)
        childScopeContext.definedVariables.add(contextVarName)
        if (indexVarName) childScopeContext.definedVariables.add(indexVarName)

        await this.readBaseMetadata({
          node: childNode,
          scopeContext: copyScopeContext(scopeContext),
          isInMessageTag,
          isInContentTag,
        })
      }
      if (node.else) {
        for await (const childNode of node.else.children ?? []) {
          await this.readBaseMetadata({
            node: childNode,
            scopeContext: copyScopeContext(scopeContext),
            isInMessageTag,
            isInContentTag,
          })
        }
      }
    }

    if (node.type === 'ElementTag') {
      if (
        node.name === CUSTOM_MESSAGE_TAG ||
        Object.values(MessageRole).includes(node.name as MessageRole)
      ) {
        /* Message tag */
        if (isInMessageTag) {
          this.baseNodeError(errors.messageTagInsideMessage, node)
        }
      } else if (
        Object.values(ContentType).includes(node.name as ContentType)
      ) {
        /* Content tag */
        if (isInContentTag) {
          this.baseNodeError(errors.contentTagInsideContent, node)
        }
      } else if (node.name === REFERENCE_PROMPT_TAG) {
        /* Reference tag */
        if (isInMessageTag) {
          this.baseNodeError(
            errors.invalidTagPlacement(node.name, 'message'),
            node,
          )
        }
        if (isInContentTag) {
          this.baseNodeError(
            errors.invalidTagPlacement(node.name, 'content'),
            node,
          )
        }

        if (node.children?.length ?? 0 > 0) {
          this.baseNodeError(errors.referenceTagHasContent, node)
        }

        const refPromptAttribute = node.attributes.find(
          (attribute: Attribute) => attribute.name === REFERENCE_PROMPT_ATTR,
        ) as Attribute | undefined
        if (!refPromptAttribute) {
          this.baseNodeError(errors.referenceTagWithoutPrompt, node)
        }

        if (
          refPromptAttribute.value === true ||
          refPromptAttribute.value.some((node) => node.type === 'MustacheTag')
        ) {
          this.baseNodeError(
            errors.invalidStaticAttribute(REFERENCE_PROMPT_ATTR),
            refPromptAttribute,
          )
        }

        // Obtain the referenced prompt
        if (!this.referenceFn) {
          this.baseNodeError(errors.missingReferenceFunction, node)
        }

        const refPromptPath = refPromptAttribute.value
          .map((node) => node.data)
          .join('')
        if (this.referencedPrompts[refPromptPath]) return

        try {
          const refPrompt = await this.referenceFn(refPromptPath)

          const refReadMetadata = new ReadMetadata({
            prompt: refPrompt,
            referenceFn: this.referenceFn,
          })
          refReadMetadata.referencedPrompts = this.referencedPrompts

          const refPromptMetadata = await refReadMetadata.run()
          refPromptMetadata.parameters.forEach((param: string) => {
            if (!scopeContext.definedVariables.has(param)) {
              scopeContext.usedUndefinedVariables.add(param)
            }
          })

          this.referencedPrompts[refPromptPath] = refPromptMetadata.hash
        } catch (error: unknown) {
          if (error instanceof CompileError) throw error
          this.baseNodeError(errors.referenceError(error), node)
        }

        return
      }

      /* Unknown tag */
      this.baseNodeError(errors.invalidMessageRole(node.name), node)
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
