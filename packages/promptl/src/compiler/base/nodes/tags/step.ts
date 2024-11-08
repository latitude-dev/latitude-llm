import { tagAttributeIsLiteral } from '$promptl/compiler/utils'
import errors from '$promptl/error/errors'
import { ChainStepTag } from '$promptl/parser/interfaces'
import { Config } from '$promptl/types'

import { CompileNodeContext } from '../../types'

function isValidConfig(value: unknown): value is Config | undefined {
  if (value === undefined) return true
  if (Array.isArray(value)) return false
  return typeof value === 'object'
}

export async function compile(
  {
    node,
    scope,
    isInsideStepTag,
    isInsideMessageTag,
    isInsideContentTag,
    popStepResponse,
    groupContent,
    resolveBaseNode,
    baseNodeError,
    stop,
  }: CompileNodeContext<ChainStepTag>,
  attributes: Record<string, unknown>,
) {
  if (isInsideStepTag) {
    baseNodeError(errors.stepTagInsideStep, node)
  }

  const stepResponse = popStepResponse()

  const { as: varName, ...config } = attributes

  // The step must be processed.
  if (stepResponse === undefined) {
    if (!isValidConfig(config)) {
      baseNodeError(errors.invalidStepConfig, node)
    }

    for await (const childNode of node.children ?? []) {
      await resolveBaseNode({
        node: childNode,
        scope,
        isInsideStepTag: true,
        isInsideMessageTag,
        isInsideContentTag,
      })
    }

    // Stop the compiling process up to this point.
    stop(config as Config)
  }

  // The step has already been process, this is the continuation of the chain.
  if ('as' in attributes) {
    if (!tagAttributeIsLiteral(node, 'as')) {
      baseNodeError(errors.invalidStaticAttribute('as'), node)
    }

    scope.set(String(varName), stepResponse?.content)
  }

  groupContent()
}
