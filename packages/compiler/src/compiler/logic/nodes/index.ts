import { Node } from 'estree'

import { QueryMetadata } from '../../types'
import { emptyMetadata } from '../../utils'
import { NodeType, ReadNodeMetadataProps, ResolveNodeProps } from '../types'
import {
  readMetadata as readArrayMetadata,
  resolve as resolveArrayExpression,
} from './arrayExpression'
import {
  readMetadata as readAssignmentMetadata,
  resolve as resolveAssignmentExpression,
} from './assignmentExpression'
import {
  readMetadata as readBinaryMetadata,
  resolve as resolveBinaryExpression,
} from './binaryExpression'
import {
  readMetadata as readCallMetadata,
  resolve as resolveCallExpression,
} from './callExpression'
import {
  readMetadata as readChainMetadata,
  resolve as resolveChainExpression,
} from './chainExpression'
import {
  readMetadata as readConditionalMetadata,
  resolve as resolveConditionalExpression,
} from './conditionalExpression'
import { resolve as resolveIdentifier } from './identifier'
import { resolve as resolveLiteral } from './literal'
import {
  readMetadata as readMemberMetadata,
  resolve as resolveMemberExpression,
} from './memberExpression'
import {
  readMetadata as readObjectMetadata,
  resolve as resolveObjectExpression,
} from './objectExpression'
import {
  readMetadata as readSequenceMetadata,
  resolve as resolveSequenceExpression,
} from './sequenceExpression'
import {
  readMetadata as readUnaryMetadata,
  resolve as resolveUnaryExpression,
} from './unaryExpression'
import {
  readMetadata as readUpdateMetadata,
  resolve as resolveUpdateExpression,
} from './updateExpression'

type ResolveNodeFn = (props: ResolveNodeProps<Node>) => Promise<unknown>
type ReadNodeMetadataFn = (
  props: ReadNodeMetadataProps<Node>,
) => Promise<QueryMetadata>

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

export const nodeMetadataReader: Record<NodeType, ReadNodeMetadataFn> = {
  [NodeType.Identifier]: async () => emptyMetadata(), // No metadata to read
  [NodeType.Literal]: async () => emptyMetadata(), // No metadata to read

  [NodeType.ArrayExpression]: readArrayMetadata as ReadNodeMetadataFn,
  [NodeType.AssignmentExpression]: readAssignmentMetadata as ReadNodeMetadataFn,
  [NodeType.BinaryExpression]: readBinaryMetadata as ReadNodeMetadataFn,
  [NodeType.CallExpression]: readCallMetadata as ReadNodeMetadataFn,
  [NodeType.ChainExpression]: readChainMetadata as ReadNodeMetadataFn,
  [NodeType.ConditionalExpression]:
    readConditionalMetadata as ReadNodeMetadataFn,
  [NodeType.LogicalExpression]: readBinaryMetadata as ReadNodeMetadataFn,
  [NodeType.ObjectExpression]: readObjectMetadata as ReadNodeMetadataFn,
  [NodeType.MemberExpression]: readMemberMetadata as ReadNodeMetadataFn,
  [NodeType.SequenceExpression]: readSequenceMetadata as ReadNodeMetadataFn,
  [NodeType.UnaryExpression]: readUnaryMetadata as ReadNodeMetadataFn,
  [NodeType.UpdateExpression]: readUpdateMetadata as ReadNodeMetadataFn,
}
