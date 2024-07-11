import {
  resolveLogicNode,
  updateScopeContextForNode,
} from '$compiler/compiler/logic'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$compiler/compiler/logic/types'
import errors from '$compiler/error/errors'
import type { AssignmentExpression, UpdateExpression } from 'estree'

/**
 * ### UpdateExpression
 * Represents a javascript update expression.
 * Depending on the operator, it can increment or decrement a value.
 * Depending on the position of the operator, the return value can be resolved before or after the operation.
 *
 * Examples: `{--foo}` `{bar++}`
 */
export async function resolve({
  node,
  scope,
  raiseError,
  ...props
}: ResolveNodeProps<UpdateExpression>) {
  const updateOperator = node.operator

  if (!['++', '--'].includes(updateOperator)) {
    raiseError(errors.unsupportedOperator(updateOperator), node)
  }

  const assignmentOperators = {
    '++': '+=',
    '--': '-=',
  }

  const originalValue = await resolveLogicNode({
    node: node.argument,
    scope,
    raiseError,
    ...props,
  })

  if (typeof originalValue !== 'number') {
    raiseError(errors.invalidUpdate(updateOperator, typeof originalValue), node)
  }

  // Simulate an AssignmentExpression with the same operation
  const assignmentNode = {
    ...node,
    type: 'AssignmentExpression',
    left: node.argument,
    operator: assignmentOperators[updateOperator],
    right: {
      type: 'Literal',
      value: 1,
    },
  } as AssignmentExpression

  // Perform the assignment
  await resolveLogicNode({
    node: assignmentNode,
    scope,
    raiseError,
    ...props,
  })

  const updatedValue = await resolveLogicNode({
    node: node.argument,
    scope,
    raiseError,
    ...props,
  })

  return node.prefix ? updatedValue : originalValue
}

export function updateScopeContext({
  node,
  ...props
}: UpdateScopeContextProps<UpdateExpression>) {
  const updateOperator = node.operator
  if (!['++', '--'].includes(updateOperator)) {
    props.raiseError(errors.unsupportedOperator(updateOperator), node)
  }

  updateScopeContextForNode({ node: node.argument, ...props })
}
