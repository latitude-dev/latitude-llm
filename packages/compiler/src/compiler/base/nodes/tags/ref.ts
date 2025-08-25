import errors from '$compiler/error/errors'
import type { ReferenceTag } from '$compiler/parser/interfaces'

import type { CompileNodeContext } from '../../types'

export async function compile(
  { node, baseNodeError }: CompileNodeContext<ReferenceTag>,
  _: Record<string, unknown>,
) {
  baseNodeError(errors.didNotResolveReferences, node)
}
