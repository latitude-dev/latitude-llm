import errors from '$promptl/error/errors'
import { ReferenceTag } from '$promptl/parser/interfaces'

import { CompileNodeContext } from '../../types'

export async function compile(
  { node, baseNodeError }: CompileNodeContext<ReferenceTag>,
  _: Record<string, unknown>,
) {
  baseNodeError(errors.didNotResolveReferences, node)
}
