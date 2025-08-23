import { tagAttributeIsLiteral } from '$compiler/compiler/utils'
import errors from '$compiler/error/errors'
import type { ChainStepTag } from '$compiler/parser/interfaces'
import type { Config } from '$compiler/types'

import type { CompileNodeContext } from '../../types'

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
