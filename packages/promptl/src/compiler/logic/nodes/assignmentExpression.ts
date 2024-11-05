import { ASSIGNMENT_OPERATOR_METHODS } from '$compiler/compiler/logic/operators'
import type {
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$compiler/compiler/logic/types'
import errors from '$compiler/error/errors'
import type {
  AssignmentExpression,
  AssignmentOperator,
  Identifier,
  MemberExpression,
} from 'estree'

import { resolveLogicNode, updateScopeContextForNode } from '..'

/**
 * ### AssignmentExpression
 * Represents an assignment or update to a variable or property. Returns the newly assigned value.
 * The assignment can be made to an existing variable or property, or to a new one. Assignments to constants are not allowed.
 *
 * Examples: `foo = 1` `obj.foo = 'bar'` `foo += 1`
 */
export async function resolve({
  node,
  scope,
  raiseError,
  ...props
}: ResolveNodeProps<AssignmentExpression>) {
  const assignmentOperator = node.operator
  if (!(assignmentOperator in ASSIGNMENT_OPERATOR_METHODS)) {
    raiseError(errors.unsupportedOperator(assignmentOperator), node)
  }
  const assignmentMethod = ASSIGNMENT_OPERATOR_METHODS[assignmentOperator]!

  const assignmentValue = await resolveLogicNode({
    node: node.right,
    scope,
    raiseError,
    ...props,
  })

  if (node.left.type === 'Identifier') {
    await assignToVariable({
      assignmentOperator,
      assignmentMethod,
      assignmentValue,
      node: node.left,
      scope,
      raiseError,
      ...props,
    })
    return
  }

  if (node.left.type === 'MemberExpression') {
    await assignToProperty({
      assignmentOperator,
      assignmentMethod,
      assignmentValue,
      node: node.left,
      scope,
      raiseError,
      ...props,
    })
    return
  }

  raiseError(errors.invalidAssignment, node)
}

async function assignToVariable({
  assignmentOperator,
  assignmentMethod,
  assignmentValue,
  node,
  scope,
  raiseError,
}: ResolveNodeProps<Identifier> & {
  assignmentOperator: AssignmentOperator
  assignmentMethod: (typeof ASSIGNMENT_OPERATOR_METHODS)[keyof typeof ASSIGNMENT_OPERATOR_METHODS]
  assignmentValue: unknown
}) {
  const assignedVariableName = node.name

  if (assignmentOperator != '=' && !scope.exists(assignedVariableName)) {
    raiseError(errors.variableNotDeclared(assignedVariableName), node)
  }

  const updatedValue = assignmentMethod(
    scope.exists(assignedVariableName)
      ? scope.get(assignedVariableName)
      : undefined,
    assignmentValue,
  )

  scope.set(assignedVariableName, updatedValue)
  return updatedValue
}

async function assignToProperty({
  assignmentOperator,
  assignmentMethod,
  assignmentValue,
  node,
  ...props
}: ResolveNodeProps<MemberExpression> & {
  assignmentOperator: AssignmentOperator
  assignmentMethod: (typeof ASSIGNMENT_OPERATOR_METHODS)[keyof typeof ASSIGNMENT_OPERATOR_METHODS]
  assignmentValue: unknown
}) {
  const { raiseError } = props
  const object = (await resolveLogicNode({
    node: node.object,
    ...props,
  })) as { [key: string]: any }

  const property = (
    node.computed
      ? await resolveLogicNode({
          node: node.property,
          ...props,
        })
      : (node.property as Identifier).name
  ) as string

  if (assignmentOperator != '=' && !(property in object)) {
    raiseError(errors.propertyNotExists(property), node)
  }

  const originalValue = object[property]
  const updatedValue = assignmentMethod(originalValue, assignmentValue)
  object[property] = updatedValue
  return updatedValue
}

export function updateScopeContext({
  node,
  scopeContext,
  raiseError,
}: UpdateScopeContextProps<AssignmentExpression>) {
  const assignmentOperator = node.operator
  if (!(assignmentOperator in ASSIGNMENT_OPERATOR_METHODS)) {
    raiseError(errors.unsupportedOperator(assignmentOperator), node)
  }

  updateScopeContextForNode({ node: node.right, scopeContext, raiseError })

  if (node.left.type === 'Identifier') {
    // Variable assignment
    const assignedVariableName = (node.left as Identifier).name
    if (assignmentOperator != '=') {
      // Update an existing variable
      if (!scopeContext.definedVariables.has(assignedVariableName)) {
        scopeContext.usedUndefinedVariables.add(assignedVariableName)
      }
    }
    scopeContext.definedVariables.add(assignedVariableName)
    return
  }

  if (node.left.type === 'MemberExpression') {
    updateScopeContextForNode({ node: node.left, scopeContext, raiseError })
    return
  }

  raiseError(errors.invalidAssignment, node)
}
