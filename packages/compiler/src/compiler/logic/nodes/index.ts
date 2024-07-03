import { Node } from 'estree'

import { NodeType, ResolveNodeProps } from '../types'
import { resolve as resolveArrayExpression } from './arrayExpression'
import { resolve as resolveAssignmentExpression } from './assignmentExpression'
import { resolve as resolveBinaryExpression } from './binaryExpression'
import { resolve as resolveCallExpression } from './callExpression'
import { resolve as resolveChainExpression } from './chainExpression'
import { resolve as resolveConditionalExpression } from './conditionalExpression'
import { resolve as resolveIdentifier } from './identifier'
import { resolve as resolveLiteral } from './literal'
import { resolve as resolveMemberExpression } from './memberExpression'
import { resolve as resolveObjectExpression } from './objectExpression'
import { resolve as resolveSequenceExpression } from './sequenceExpression'
import { resolve as resolveUnaryExpression } from './unaryExpression'
import { resolve as resolveUpdateExpression } from './updateExpression'

type ResolveNodeFn = (props: ResolveNodeProps<Node>) => Promise<unknown>

export const nodeResolvers: Record<NodeType, ResolveNodeFn> = {
  [NodeType.ArrayExpression]: resolveArrayExpression as ResolveNodeFn,
  [NodeType.AssignmentExpression]: resolveAssignmentExpression as ResolveNodeFn,
  [NodeType.BinaryExpression]: resolveBinaryExpression as ResolveNodeFn,
  [NodeType.CallExpression]: resolveCallExpression as ResolveNodeFn,
  [NodeType.ChainExpression]: resolveChainExpression as ResolveNodeFn,
  [NodeType.ConditionalExpression]:
    resolveConditionalExpression as ResolveNodeFn,
  [NodeType.Identifier]: resolveIdentifier as ResolveNodeFn,
  [NodeType.Literal]: resolveLiteral as ResolveNodeFn,
  [NodeType.LogicalExpression]: resolveBinaryExpression as ResolveNodeFn,
  [NodeType.ObjectExpression]: resolveObjectExpression as ResolveNodeFn,
  [NodeType.MemberExpression]: resolveMemberExpression as ResolveNodeFn,
  [NodeType.SequenceExpression]: resolveSequenceExpression as ResolveNodeFn,
  [NodeType.UnaryExpression]: resolveUnaryExpression as ResolveNodeFn,
  [NodeType.UpdateExpression]: resolveUpdateExpression as ResolveNodeFn,
}
