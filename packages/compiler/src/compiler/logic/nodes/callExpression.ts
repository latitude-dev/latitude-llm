import type { Identifier, Literal, SimpleCallExpression } from 'estree'

import { getLogicNodeMetadata, resolveLogicNode } from '..'
import CompileError from '../../../error/error'
import errors from '../../../error/errors'
import { emptyMetadata, mergeMetadata } from '../../utils'
import {
  NodeType,
  type ReadNodeMetadataProps,
  type ResolveNodeProps,
} from '../types'

/**
 * ### CallExpression
 * Represents a method call.
 *
 * Examples: `foo()` `foo.bar()`
 */
export async function resolve(props: ResolveNodeProps<SimpleCallExpression>) {
  const { node, supportedMethods, raiseError } = props
  if (
    node.callee.type === NodeType.Identifier &&
    node.callee.name in supportedMethods
  ) {
    return resolveSupportedMethod(props)
  }

  const method = (await resolveLogicNode({
    ...props,
    node: node.callee,
  })) as Function

  if (typeof method !== 'function') {
    raiseError(errors.notAFunction(typeof method), node)
  }

  const args = await resolveArgs(props)
  return await runMethod({ ...props, method, args })
}

async function resolveSupportedMethod(
  props: ResolveNodeProps<SimpleCallExpression>,
) {
  const { node, supportedMethods, raiseError, willInterpolate, resolveFn } =
    props
  const methodName = (node.callee as Identifier).name
  const { requirements: reqs, resolve: method } = supportedMethods[methodName]!
  const requirements = {
    interpolationPolicy: 'allow',
    interpolationMethod: 'parameterize',
    requireStaticArguments: false,
    ...(reqs ?? {}),
  }

  if (requirements.requireStaticArguments && !onlyContainsStaticArgs(node)) {
    raiseError(errors.functionRequiresStaticArguments(methodName), node)
  }

  if (requirements.interpolationPolicy === 'require' && !willInterpolate) {
    raiseError(errors.functionRequiresInterpolation(methodName), node)
  }

  if (requirements.interpolationPolicy === 'disallow' && willInterpolate) {
    raiseError(errors.functionDisallowsInterpolation(methodName), node)
  }

  const args = await resolveArgs(props)
  const result = await runMethod({ ...props, method, args })

  if (!willInterpolate) return result

  if (requirements?.interpolationMethod === 'raw') {
    return String(result)
  }

  return resolveFn(result)
}

function resolveArgs(
  props: ResolveNodeProps<SimpleCallExpression>,
): Promise<unknown[]> {
  const { node } = props
  return Promise.all(
    node.arguments.map((arg) =>
      resolveLogicNode({
        ...props,
        node: arg,
        willInterpolate: false,
      }),
    ),
  )
}

interface SimpleCallExpressionWithStaticArgs extends SimpleCallExpression {
  arguments: Literal[]
}
function onlyContainsStaticArgs(
  node: SimpleCallExpression,
): node is SimpleCallExpressionWithStaticArgs {
  return node.arguments.every((arg) => arg.type === NodeType.Literal)
}

async function runMethod({
  method,
  args,
  node,
  willInterpolate,
  raiseError,
}: ResolveNodeProps<SimpleCallExpression> & {
  method: Function
  args: unknown[]
}) {
  try {
    const result = await method(...args)
    if (willInterpolate) {
      return String(result)
    }
    return result
  } catch (error: unknown) {
    if (error instanceof CompileError) throw error
    raiseError(errors.functionCallError(error), node)
  }
}

export async function readMetadata(
  props: ReadNodeMetadataProps<SimpleCallExpression>,
) {
  const { node, supportedMethods } = props
  const argumentsMetadata = await Promise.all(
    node.arguments.map((arg) =>
      getLogicNodeMetadata({
        ...props,
        node: arg,
      }),
    ),
  )

  const calleeMetadata = await getLogicNodeMetadata({
    ...props,
    node: node.callee,
  })

  let resultsMetadata = emptyMetadata()

  if (node.callee.type === NodeType.Identifier) {
    const methodName = node.callee.name
    if (methodName in supportedMethods) {
      calleeMetadata.methods.add(methodName)
      const args = onlyContainsStaticArgs(node)
        ? node.arguments.map((arg) => arg.value)
        : []
      resultsMetadata = await supportedMethods[methodName]!.readMetadata(args)
    }
  }

  return mergeMetadata(calleeMetadata, resultsMetadata, ...argumentsMetadata)
}
