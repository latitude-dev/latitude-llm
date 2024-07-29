import { tagAttributeIsLiteral } from '$compiler/compiler/utils'
import errors from '$compiler/error/errors'
import { ChainStepTag } from '$compiler/parser/interfaces'
import { Config, ContentType } from '$compiler/types'

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

    const responseText = stepResponse?.content
      .filter((c) => c.type === ContentType.text)
      .map((c) => c.value)
      .join(' ')

    scope.set(String(varName), responseText)
  }

  groupContent()
  addMessage(stepResponse!)
}
