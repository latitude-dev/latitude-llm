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
    popStepResponse,
    addMessage,
    groupContent,
    baseNodeError,
    stop,
  }: CompileNodeContext<ChainStepTag>,
  attributes: Record<string, unknown>,
) {
  const stepResponse = popStepResponse()

  const { as: varName, ...config } = attributes

  if (stepResponse === undefined) {
    if (!isValidConfig(config)) {
      baseNodeError(errors.invalidStepConfig, node)
    }

    stop(config as Config)
  }

  if ('as' in attributes) {
    if (!tagAttributeIsLiteral(node, 'as')) {
      baseNodeError(errors.invalidStaticAttribute('as'), node)
    }

    scope.set(String(varName), stepResponse?.content)
  }

  groupContent()
  addMessage(stepResponse!)
}
