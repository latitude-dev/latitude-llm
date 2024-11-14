import Scope from '$promptl/compiler/scope'
import errors from '$promptl/error/errors'
import parse from '$promptl/parser'
import { Fragment, ReferenceTag } from '$promptl/parser/interfaces'

import { CompileNodeContext, TemplateNodeWithStatus } from '../../types'

type ForNodeWithStatus = TemplateNodeWithStatus & {
  status: TemplateNodeWithStatus['status'] & {
    refAst: Fragment
    refFullPath: string
  }
}

export async function compile(
  props: CompileNodeContext<ReferenceTag>,
  attributes: Record<string, unknown>,
) {
  const {
    node,
    scope,
    fullPath,
    referencePromptFn,
    baseNodeError,
    resolveBaseNode,
  } = props

  const nodeWithStatus = node as ForNodeWithStatus
  nodeWithStatus.status = {
    ...nodeWithStatus.status,
    scopePointers: scope.getPointers(),
  }

  const { path, ...refParameters } = attributes
  if (!path) baseNodeError(errors.referenceTagWithoutPrompt, node)
  if (typeof path !== 'string') baseNodeError(errors.invalidReferencePath, node)

  if (!nodeWithStatus.status.refAst || !nodeWithStatus.status.refFullPath) {
    if (!referencePromptFn) baseNodeError(errors.missingReferenceFunction, node)

    const prompt = await referencePromptFn!(path as string, fullPath)
    if (!prompt) baseNodeError(errors.referenceNotFound, node)
    const ast = parse(prompt!.content)
    nodeWithStatus.status.refAst = ast
    nodeWithStatus.status.refFullPath = prompt!.path
  }

  const refScope = new Scope(refParameters)
  await resolveBaseNode({
    ...props,
    node: nodeWithStatus.status.refAst,
    scope: refScope,
    fullPath: nodeWithStatus.status.refFullPath,
  })
}
