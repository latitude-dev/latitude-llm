import {
  NodeType,
  ResolveNodeProps,
  UpdateScopeContextProps,
} from '$compiler/compiler/logic/types'
import { Node } from 'estree'

import {
  resolve as resolveArrayExpression,
  updateScopeContext as updateArrayScopeContext,
} from './arrayExpression'
import {
  resolve as resolveAssignmentExpression,
  updateScopeContext as updateAssignmentScopeContext,
} from './assignmentExpression'
import {
  resolve as resolveBinaryExpression,
  updateScopeContext as updateBinaryScopeContext,
} from './binaryExpression'
import {
  resolve as resolveCallExpression,
  updateScopeContext as updateCallScopeContext,
} from './callExpression'
import {
  resolve as resolveChainExpression,
  updateScopeContext as updateChainScopeContext,
} from './chainExpression'
import {
  resolve as resolveConditionalExpression,
  updateScopeContext as updateConditionalScopeContext,
} from './conditionalExpression'
import {
  resolve as resolveIdentifier,
  updateScopeContext as updateIdentifierScopeContext,
} from './identifier'
import {
  resolve as resolveLiteral,
  updateScopeContext as updateLiteralScopeContext,
} from './literal'
import {
  resolve as resolveMemberExpression,
  updateScopeContext as updateMemberScopeContext,
} from './memberExpression'
import {
  resolve as resolveObjectExpression,
  updateScopeContext as updateObjectScopeContext,
} from './objectExpression'
import {
  resolve as resolveSequenceExpression,
  updateScopeContext as updateSequenceScopeContext,
} from './sequenceExpression'
import {
  resolve as resolveUnaryExpression,
  updateScopeContext as updateUnaryScopeContext,
} from './unaryExpression'
import {
  resolve as resolveUpdateExpression,
  updateScopeContext as updateUpdateScopeContext,
} from './updateExpression'

type ResolveNodeFn = (props: ResolveNodeProps<Node>) => Promise<unknown>
type UpdateScopeContextFn = (props: UpdateScopeContextProps<Node>) => void

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

export const updateScopeContextResolvers: Record<
  NodeType,
  UpdateScopeContextFn
> = {
  [NodeType.ArrayExpression]: updateArrayScopeContext as UpdateScopeContextFn,
  [NodeType.AssignmentExpression]:
    updateAssignmentScopeContext as UpdateScopeContextFn,
  [NodeType.BinaryExpression]: updateBinaryScopeContext as UpdateScopeContextFn,
  [NodeType.CallExpression]: updateCallScopeContext as UpdateScopeContextFn,
  [NodeType.ChainExpression]: updateChainScopeContext as UpdateScopeContextFn,
  [NodeType.ConditionalExpression]:
    updateConditionalScopeContext as UpdateScopeContextFn,
  [NodeType.Identifier]: updateIdentifierScopeContext as UpdateScopeContextFn,
  [NodeType.Literal]: updateLiteralScopeContext as UpdateScopeContextFn,
  [NodeType.LogicalExpression]:
    updateBinaryScopeContext as UpdateScopeContextFn,
  [NodeType.ObjectExpression]: updateObjectScopeContext as UpdateScopeContextFn,
  [NodeType.MemberExpression]: updateMemberScopeContext as UpdateScopeContextFn,
  [NodeType.SequenceExpression]:
    updateSequenceScopeContext as UpdateScopeContextFn,
  [NodeType.UnaryExpression]: updateUnaryScopeContext as UpdateScopeContextFn,
  [NodeType.UpdateExpression]: updateUpdateScopeContext as UpdateScopeContextFn,
}
