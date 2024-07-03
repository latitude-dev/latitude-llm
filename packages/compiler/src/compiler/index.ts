import { createHash } from 'node:crypto'

import type { Identifier, Literal, Node } from 'estree'

import { error } from '../error/error'
import errors from '../error/errors'
import parse from '../parser/index'
import { BaseNode, type TemplateNode } from '../parser/interfaces'
import { getLogicNodeMetadata, resolveLogicNode } from './logic'
import { NodeType } from './logic/types'
import Scope from './scope'
import type { CompileContext, QueryMetadata } from './types'
import { emptyMetadata, hasContent, isIterable, mergeMetadata } from './utils'

export class Compiler {
  private context: CompileContext
  private currentConfig: Record<string, unknown> = {}

  constructor({ sql, supportedMethods = {}, resolveFn }: CompileContext) {
    this.context = { sql, supportedMethods, resolveFn }
  }

  /**
   * Resolves every block, expression, and function inside the SQL and returns the final query.
   *
   * Note: Compiling a query may take time in some cases, as some queries may contain expensive
   * functions that need to be resolved at runtime.
   */
  async compileSQL(): Promise<string> {
    const fragment = parse(this.context.sql)
    const localScope = new Scope()
    const compiledSql = (await this.resolveBaseNode(fragment, localScope, 0))
      .replace(/ +/g, ' ') // Remove extra spaces
      .trim() // Remove leading and trailing spaces

    return compiledSql
  }

  /**
   * Without compiling the SQL or resolving any expression, quickly reads the config and calls
   * to the supported methods present in the SQL.
   */
  async readMetadata(): Promise<QueryMetadata> {
    const fragment = parse(this.context.sql)
    const rawSql = this.context.sql
    const sqlHash = createHash('sha256').update(rawSql).digest('hex')
    const baseMetadata = await this.getBaseNodeMetadata({
      baseNode: fragment,
      depth: 0,
    })
    return mergeMetadata(baseMetadata, { ...emptyMetadata(), sqlHash, rawSql })
  }

  /**
   * Given a base node, returns the string that will replace it in the final SQL
   */
  private resolveBaseNode = async (
    baseNode: BaseNode,
    localScope: Scope,
    depth: number,
  ): Promise<string> => {
    if (!baseNode) return ''

    if (baseNode.type === 'Fragment') {
      // Parent node, only one of its kind
      return this.resolveBaseNodeChildren(baseNode.children, localScope, depth)
    }

    if (baseNode.type === 'Comment') {
      return baseNode.raw
    }

    if (baseNode.type === 'Text') {
      return baseNode.raw
    }

    if (baseNode.type === 'MustacheTag') {
      const expression = baseNode.expression

      // Some node expressions do not inject any value into the SQL
      const silentExpressions = [NodeType.AssignmentExpression]

      if (silentExpressions.includes(expression.type as NodeType)) {
        await resolveLogicNode({
          node: expression,
          scope: localScope,
          raiseError: this.expressionError.bind(this),
          supportedMethods: this.context.supportedMethods,
          willInterpolate: false,
          resolveFn: this.context.resolveFn,
        })
        return ''
      }

      if (
        // If the expression is a call to a supported method, the result WILL BE INTERPOLATED
        expression.type === NodeType.CallExpression &&
        expression.callee.type === NodeType.Identifier &&
        expression.callee.name in this.context.supportedMethods
      ) {
        return (await resolveLogicNode({
          node: expression,
          scope: localScope,
          raiseError: this.expressionError.bind(this),
          supportedMethods: this.context.supportedMethods,
          willInterpolate: true,
          resolveFn: this.context.resolveFn,
        })) as string
      }

      const value = await resolveLogicNode({
        node: expression,
        scope: localScope,
        raiseError: this.expressionError.bind(this),
        supportedMethods: this.context.supportedMethods,
        willInterpolate: false,
        resolveFn: this.context.resolveFn,
      })
      const resolvedValue = await this.context.resolveFn(value)

      return resolvedValue
    }

    if (baseNode.type === 'ConstTag') {
      // Only allow equal expressions to define constants
      const expression = baseNode.expression
      if (
        expression.type !== 'AssignmentExpression' ||
        expression.operator !== '=' ||
        expression.left.type !== 'Identifier'
      ) {
        this.baseNodeError(errors.invalidConstantDefinition, baseNode)
      }

      const constName = (expression.left as Identifier).name
      const constValue = await resolveLogicNode({
        node: expression.right,
        scope: localScope,
        raiseError: this.expressionError.bind(this),
        supportedMethods: this.context.supportedMethods,
        willInterpolate: false,
        resolveFn: this.context.resolveFn,
      })
      if (localScope.exists(constName)) {
        this.baseNodeError(errors.variableAlreadyDeclared(constName), baseNode)
      }
      localScope.defineConst(constName, constValue)
      return ''
    }

    if (baseNode.type === 'ConfigTag') {
      if (depth > 0) {
        this.baseNodeError(errors.configInsideBlock, baseNode)
      }

      const expression = baseNode.expression
      if (
        expression.type !== 'AssignmentExpression' ||
        expression.operator !== '=' ||
        expression.left.type !== 'Identifier'
      ) {
        this.baseNodeError(errors.invalidConfigDefinition, baseNode)
      }

      if (expression.right.type !== 'Literal') {
        this.baseNodeError(errors.invalidConfigValue, baseNode)
      }

      return ''
    }

    if (baseNode.type === 'IfBlock') {
      const condition = await resolveLogicNode({
        node: baseNode.expression,
        scope: localScope,
        raiseError: this.expressionError.bind(this),
        supportedMethods: this.context.supportedMethods,
        willInterpolate: false,
        resolveFn: this.context.resolveFn,
      })
      return condition
        ? this.resolveBaseNodeChildren(baseNode.children, localScope, depth + 1)
        : await this.resolveBaseNode(baseNode.else, localScope, depth + 1)
    }

    if (baseNode.type === 'ElseBlock') {
      return this.resolveBaseNodeChildren(
        baseNode.children,
        localScope,
        depth + 1,
      )
    }

    if (baseNode.type === 'EachBlock') {
      const iterableElement = (await resolveLogicNode({
        node: baseNode.expression,
        scope: localScope,
        raiseError: this.expressionError.bind(this),
        supportedMethods: this.context.supportedMethods,
        willInterpolate: false,
        resolveFn: this.context.resolveFn,
      })) as Iterable<unknown>

      if (
        !isIterable(iterableElement) ||
        !(await hasContent(iterableElement))
      ) {
        return await this.resolveBaseNode(baseNode.else, localScope, depth + 1)
      }

      const contextVar = baseNode.context.name
      const indexVar = baseNode.index
      if (localScope.exists(contextVar)) {
        this.baseNodeError(errors.variableAlreadyDeclared(contextVar), baseNode)
      }
      if (indexVar && localScope.exists(indexVar)) {
        this.baseNodeError(errors.variableAlreadyDeclared(indexVar), baseNode)
      }

      const parsedChildren: string[] = []
      let i = 0
      for await (const element of iterableElement) {
        if (indexVar) localScope.set(indexVar, i)
        localScope.set(contextVar, element)
        parsedChildren.push(
          await this.resolveBaseNodeChildren(
            baseNode.children,
            localScope,
            depth + 1,
          ),
        )
        i++
      }
      return parsedChildren.join('') || ''
    }

    throw this.baseNodeError(
      errors.unsupportedBaseNodeType(baseNode.type),
      baseNode,
    )
  }

  private resolveBaseNodeChildren = async (
    children: TemplateNode[] | undefined,
    localScope: Scope,
    depth: number,
  ): Promise<string> => {
    const parsedChildren: string[] = []
    const childrenScope = localScope.copy() // All children share the same scope
    for (const child of children || []) {
      const parsedChild = await this.resolveBaseNode(
        child,
        childrenScope,
        depth,
      )
      parsedChildren.push(parsedChild)
    }
    return parsedChildren.join('') || ''
  }

  /**
   * Given a base node, returns the list of defined configs and present methods from the supportedMethods.
   */
  private getBaseNodeMetadata = async ({
    baseNode,
    depth,
  }: {
    baseNode: BaseNode
    depth: number
  }): Promise<QueryMetadata> => {
    if (!baseNode) return emptyMetadata()

    if (baseNode.type === 'Fragment') {
      const childrenMetadata = await Promise.all(
        (baseNode.children || []).map((child) =>
          this.getBaseNodeMetadata({
            baseNode: child,
            depth,
          }),
        ),
      )
      return mergeMetadata(...childrenMetadata)
    }

    // Not computed nodes. Do not contain any configs or methods
    if (['Comment', 'Text'].includes(baseNode.type)) {
      return emptyMetadata()
    }

    if (baseNode.type === 'MustacheTag') {
      const expression = baseNode.expression

      return await getLogicNodeMetadata({
        node: expression,
        supportedMethods: this.context.supportedMethods,
      })
    }

    if (baseNode.type === 'ConstTag') {
      // Only allow equal expressions to define constants
      const expression = baseNode.expression

      return await getLogicNodeMetadata({
        node: expression,
        supportedMethods: this.context.supportedMethods,
      })
    }

    if (baseNode.type === 'ConfigTag') {
      if (depth > 0) {
        this.baseNodeError(errors.configInsideBlock, baseNode)
      }

      const expression = baseNode.expression
      if (
        expression.type !== 'AssignmentExpression' ||
        expression.operator !== '=' ||
        expression.left.type !== 'Identifier'
      ) {
        this.baseNodeError(errors.invalidConfigDefinition, baseNode)
      }

      if (expression.right.type !== 'Literal') {
        this.baseNodeError(errors.invalidConfigValue, baseNode)
      }

      const configName = (expression.left as Identifier).name
      const configValue = (expression.right as Literal).value

      if (configName in this.currentConfig) {
        this.baseNodeError(errors.configAlreadyDefined(configName), baseNode)
      }

      this.currentConfig[configName] = configValue

      return {
        ...emptyMetadata(),
        config: {
          [configName]: configValue,
        },
      }
    }

    if (baseNode.type === 'IfBlock' || baseNode.type === 'EachBlock') {
      const expression = baseNode.expression
      const conditionMetadata = await getLogicNodeMetadata({
        node: expression,
        supportedMethods: this.context.supportedMethods,
      })

      const elseMetadata = await this.getBaseNodeMetadata({
        baseNode: baseNode.else,
        depth: depth + 1,
      })

      const childrenMetadata = await Promise.all(
        (baseNode.children || []).map((child) =>
          this.getBaseNodeMetadata({
            baseNode: child,
            depth: depth + 1,
          }),
        ),
      )

      return mergeMetadata(conditionMetadata, elseMetadata, ...childrenMetadata)
    }

    if (baseNode.type === 'ElseBlock') {
      const childrenMetadata = await Promise.all(
        (baseNode.children || []).map((child) =>
          this.getBaseNodeMetadata({
            baseNode: child,
            depth: depth + 1,
          }),
        ),
      )
      return mergeMetadata(...childrenMetadata)
    }

    throw this.baseNodeError(
      errors.unsupportedBaseNodeType(baseNode.type),
      baseNode,
    )
  }

  private baseNodeError(
    { code, message }: { code: string; message: string },
    node: BaseNode,
  ): never {
    error(message, {
      name: 'CompileError',
      code,
      source: this.context.sql || '',
      start: node.start || 0,
      end: node.end || undefined,
    })
  }

  private expressionError(
    { code, message }: { code: string; message: string },
    node: Node,
  ): never {
    const source = (node.loc?.source ?? this.context.sql)!.split('\n')
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
      source: this.context.sql || '',
      start,
      end,
    })
  }
}
