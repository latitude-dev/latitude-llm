import errors from '$compiler/error/errors'
import { ReferenceTag } from '$compiler/parser/interfaces'

import { CompileNodeContext } from '../../types'

export async function compile(
  { node, baseNodeError }: CompileNodeContext<ReferenceTag>,
  _: Record<string, unknown>,
) {
  baseNodeError(errors.didNotResolveReferences, node)
}
