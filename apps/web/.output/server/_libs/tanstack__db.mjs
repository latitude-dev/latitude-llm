import { c as compareKeys, g as groupBy, m as map, f as filter, s as serializeValue, a as groupByOperators, o as orderByWithFractionalIndex, t as tap, j as join, d as distinct, M as MultiSet, D as D2, b as output } from "./tanstack__db-ivm.mjs";
class BaseExpression {
}
class CollectionRef extends BaseExpression {
  constructor(collection, alias) {
    super();
    this.collection = collection;
    this.alias = alias;
    this.type = `collectionRef`;
  }
}
class QueryRef extends BaseExpression {
  constructor(query, alias) {
    super();
    this.query = query;
    this.alias = alias;
    this.type = `queryRef`;
  }
}
class PropRef extends BaseExpression {
  constructor(path) {
    super();
    this.path = path;
    this.type = `ref`;
  }
}
class Value extends BaseExpression {
  constructor(value) {
    super();
    this.value = value;
    this.type = `val`;
  }
}
class Func extends BaseExpression {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
    this.type = `func`;
  }
}
class Aggregate extends BaseExpression {
  constructor(name, args) {
    super();
    this.name = name;
    this.args = args;
    this.type = `agg`;
  }
}
function isExpressionLike(value) {
  return value instanceof Aggregate || value instanceof Func || value instanceof PropRef || value instanceof Value;
}
function getWhereExpression(where) {
  return typeof where === `object` && `expression` in where ? where.expression : where;
}
function getHavingExpression(having) {
  return typeof having === `object` && `expression` in having ? having.expression : having;
}
function isResidualWhere(where) {
  return typeof where === `object` && `expression` in where && where.residual === true;
}
function createResidualWhere(expression) {
  return { expression, residual: true };
}
function getRefFromAlias(query, alias) {
  if (query.from.alias === alias) {
    return query.from;
  }
  for (const join2 of query.join || []) {
    if (join2.from.alias === alias) {
      return join2.from;
    }
  }
}
function followRef(query, ref, collection) {
  if (ref.path.length === 0) {
    return;
  }
  if (ref.path.length === 1) {
    const field = ref.path[0];
    if (query.select) {
      const selectedField = query.select[field];
      if (selectedField && selectedField.type === `ref`) {
        return followRef(query, selectedField, collection);
      }
    }
    return { collection, path: [field] };
  }
  if (ref.path.length > 1) {
    const [alias, ...rest] = ref.path;
    const aliasRef = getRefFromAlias(query, alias);
    if (!aliasRef) {
      return;
    }
    if (aliasRef.type === `queryRef`) {
      return followRef(aliasRef.query, new PropRef(rest), collection);
    } else {
      return { collection: aliasRef.collection, path: rest };
    }
  }
}
class TanStackDBError extends Error {
  constructor(message) {
    super(message);
    this.name = `TanStackDBError`;
  }
}
class SchemaValidationError extends TanStackDBError {
  constructor(type, issues, message) {
    const defaultMessage = `${type === `insert` ? `Insert` : `Update`} validation failed: ${issues.map((issue) => `
- ${issue.message} - path: ${issue.path}`).join(``)}`;
    super(message || defaultMessage);
    this.name = `SchemaValidationError`;
    this.type = type;
    this.issues = issues;
  }
}
class CollectionConfigurationError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `CollectionConfigurationError`;
  }
}
class CollectionRequiresConfigError extends CollectionConfigurationError {
  constructor() {
    super(`Collection requires a config`);
  }
}
class CollectionRequiresSyncConfigError extends CollectionConfigurationError {
  constructor() {
    super(`Collection requires a sync config`);
  }
}
class InvalidSchemaError extends CollectionConfigurationError {
  constructor() {
    super(`Schema must implement the standard-schema interface`);
  }
}
class SchemaMustBeSynchronousError extends CollectionConfigurationError {
  constructor() {
    super(`Schema validation must be synchronous`);
  }
}
class CollectionStateError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `CollectionStateError`;
  }
}
class CollectionInErrorStateError extends CollectionStateError {
  constructor(operation, collectionId) {
    super(
      `Cannot perform ${operation} on collection "${collectionId}" - collection is in error state. Try calling cleanup() and restarting the collection.`
    );
  }
}
class InvalidCollectionStatusTransitionError extends CollectionStateError {
  constructor(from, to, collectionId) {
    super(
      `Invalid collection status transition from "${from}" to "${to}" for collection "${collectionId}"`
    );
  }
}
class CollectionIsInErrorStateError extends CollectionStateError {
  constructor() {
    super(`Collection is in error state`);
  }
}
class NegativeActiveSubscribersError extends CollectionStateError {
  constructor() {
    super(`Active subscribers count is negative - this should never happen`);
  }
}
class CollectionOperationError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `CollectionOperationError`;
  }
}
class UndefinedKeyError extends CollectionOperationError {
  constructor(item) {
    super(
      `An object was created without a defined key: ${JSON.stringify(item)}`
    );
  }
}
class InvalidKeyError extends CollectionOperationError {
  constructor(key, item) {
    const keyType = key === null ? `null` : typeof key;
    super(
      `getKey returned an invalid key type. Expected string or number, but got ${keyType}: ${JSON.stringify(key)}. Item: ${JSON.stringify(item)}`
    );
  }
}
class DuplicateKeyError extends CollectionOperationError {
  constructor(key) {
    super(
      `Cannot insert document with ID "${key}" because it already exists in the collection`
    );
  }
}
class DuplicateKeySyncError extends CollectionOperationError {
  constructor(key, collectionId, options) {
    const baseMessage = `Cannot insert document with key "${key}" from sync because it already exists in the collection "${collectionId}"`;
    if (options?.hasCustomGetKey && options.hasDistinct) {
      super(
        `${baseMessage}. This collection uses a custom getKey with .distinct(). The .distinct() operator deduplicates by the ENTIRE selected object (standard SQL behavior), but your custom getKey extracts only a subset of fields. This causes multiple distinct rows (with different values in non-key fields) to receive the same key. To fix this, either: (1) ensure your SELECT only includes fields that uniquely identify each row, (2) use .groupBy() with min()/max() aggregates to select one value per group, or (3) remove the custom getKey to use the default key behavior.`
      );
    } else if (options?.hasCustomGetKey && options.hasJoins) {
      super(
        `${baseMessage}. This collection uses a custom getKey with joined queries. Joined queries can produce multiple rows with the same key when relationships are not 1:1. Consider: (1) using a composite key in your getKey function (e.g., \`\${item.key1}-\${item.key2}\`), (2) ensuring your join produces unique rows per key, or (3) removing the custom getKey to use the default composite key behavior.`
      );
    } else {
      super(baseMessage);
    }
  }
}
class MissingUpdateArgumentError extends CollectionOperationError {
  constructor() {
    super(`The first argument to update is missing`);
  }
}
class NoKeysPassedToUpdateError extends CollectionOperationError {
  constructor() {
    super(`No keys were passed to update`);
  }
}
class UpdateKeyNotFoundError extends CollectionOperationError {
  constructor(key) {
    super(
      `The key "${key}" was passed to update but an object for this key was not found in the collection`
    );
  }
}
class KeyUpdateNotAllowedError extends CollectionOperationError {
  constructor(originalKey, newKey) {
    super(
      `Updating the key of an item is not allowed. Original key: "${originalKey}", Attempted new key: "${newKey}". Please delete the old item and create a new one if a key change is necessary.`
    );
  }
}
class NoKeysPassedToDeleteError extends CollectionOperationError {
  constructor() {
    super(`No keys were passed to delete`);
  }
}
class DeleteKeyNotFoundError extends CollectionOperationError {
  constructor(key) {
    super(
      `Collection.delete was called with key '${key}' but there is no item in the collection with this key`
    );
  }
}
class MissingHandlerError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `MissingHandlerError`;
  }
}
class MissingInsertHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.insert called directly (not within an explicit transaction) but no 'onInsert' handler is configured.`
    );
  }
}
class MissingUpdateHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.update called directly (not within an explicit transaction) but no 'onUpdate' handler is configured.`
    );
  }
}
class MissingDeleteHandlerError extends MissingHandlerError {
  constructor() {
    super(
      `Collection.delete called directly (not within an explicit transaction) but no 'onDelete' handler is configured.`
    );
  }
}
class TransactionError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `TransactionError`;
  }
}
class MissingMutationFunctionError extends TransactionError {
  constructor() {
    super(`mutationFn is required when creating a transaction`);
  }
}
class TransactionNotPendingMutateError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .mutate() as the transaction is no longer pending`
    );
  }
}
class TransactionAlreadyCompletedRollbackError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .rollback() as the transaction is already completed`
    );
  }
}
class TransactionNotPendingCommitError extends TransactionError {
  constructor() {
    super(
      `You can no longer call .commit() as the transaction is no longer pending`
    );
  }
}
class NoPendingSyncTransactionWriteError extends TransactionError {
  constructor() {
    super(`No pending sync transaction to write to`);
  }
}
class SyncTransactionAlreadyCommittedWriteError extends TransactionError {
  constructor() {
    super(
      `The pending sync transaction is already committed, you can't still write to it.`
    );
  }
}
class NoPendingSyncTransactionCommitError extends TransactionError {
  constructor() {
    super(`No pending sync transaction to commit`);
  }
}
class SyncTransactionAlreadyCommittedError extends TransactionError {
  constructor() {
    super(
      `The pending sync transaction is already committed, you can't commit it again.`
    );
  }
}
class QueryBuilderError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryBuilderError`;
  }
}
class OnlyOneSourceAllowedError extends QueryBuilderError {
  constructor(context) {
    super(`Only one source is allowed in the ${context}`);
  }
}
class SubQueryMustHaveFromClauseError extends QueryBuilderError {
  constructor(context) {
    super(`A sub query passed to a ${context} must have a from clause itself`);
  }
}
class InvalidSourceError extends QueryBuilderError {
  constructor(alias) {
    super(
      `Invalid source for live query: The value provided for alias "${alias}" is not a Collection or subquery. Live queries only accept Collection instances or subqueries. Please ensure you're passing a valid Collection or QueryBuilder, not a plain array or other data type.`
    );
  }
}
class InvalidSourceTypeError extends QueryBuilderError {
  constructor(context, type) {
    super(
      `Invalid source for ${context}: Expected an object with a single key-value pair like { alias: collection }. For example: .from({ todos: todosCollection }). Got: ${type}`
    );
  }
}
class JoinConditionMustBeEqualityError extends QueryBuilderError {
  constructor() {
    super(`Join condition must be an equality expression`);
  }
}
class QueryMustHaveFromClauseError extends QueryBuilderError {
  constructor() {
    super(`Query must have a from clause`);
  }
}
class InvalidWhereExpressionError extends QueryBuilderError {
  constructor(valueType) {
    super(
      `Invalid where() expression: Expected a query expression, but received a ${valueType}. This usually happens when using JavaScript's comparison operators (===, !==, <, >, etc.) directly. Instead, use the query builder functions:

  ❌ .where(({ user }) => user.id === 'abc')
  ✅ .where(({ user }) => eq(user.id, 'abc'))

Available comparison functions: eq, gt, gte, lt, lte, and, or, not, like, ilike, isNull, isUndefined`
    );
  }
}
class QueryCompilationError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryCompilationError`;
  }
}
class DistinctRequiresSelectError extends QueryCompilationError {
  constructor() {
    super(`DISTINCT requires a SELECT clause.`);
  }
}
class FnSelectWithGroupByError extends QueryCompilationError {
  constructor() {
    super(
      `fn.select() cannot be used with groupBy(). groupBy requires the compiler to statically analyze aggregate functions (count, sum, max, etc.) in the SELECT clause, which is not possible with fn.select() since it is an opaque function. Use .select() instead of .fn.select() when combining with groupBy().`
    );
  }
}
class HavingRequiresGroupByError extends QueryCompilationError {
  constructor() {
    super(`HAVING clause requires GROUP BY clause`);
  }
}
class LimitOffsetRequireOrderByError extends QueryCompilationError {
  constructor() {
    super(
      `LIMIT and OFFSET require an ORDER BY clause to ensure deterministic results`
    );
  }
}
class CollectionInputNotFoundError extends QueryCompilationError {
  constructor(alias, collectionId, availableKeys) {
    const details = collectionId ? `alias "${alias}" (collection "${collectionId}")` : `collection "${alias}"`;
    const availableKeysMsg = availableKeys?.length ? `. Available keys: ${availableKeys.join(`, `)}` : ``;
    super(`Input for ${details} not found in inputs map${availableKeysMsg}`);
  }
}
class DuplicateAliasInSubqueryError extends QueryCompilationError {
  constructor(alias, parentAliases) {
    super(
      `Subquery uses alias "${alias}" which is already used in the parent query. Each alias must be unique across parent and subquery contexts. Parent query aliases: ${parentAliases.join(`, `)}. Please rename "${alias}" in either the parent query or subquery to avoid conflicts.`
    );
  }
}
class UnsupportedFromTypeError extends QueryCompilationError {
  constructor(type) {
    super(`Unsupported FROM type: ${type}`);
  }
}
class UnknownExpressionTypeError extends QueryCompilationError {
  constructor(type) {
    super(`Unknown expression type: ${type}`);
  }
}
class EmptyReferencePathError extends QueryCompilationError {
  constructor() {
    super(`Reference path cannot be empty`);
  }
}
class UnknownFunctionError extends QueryCompilationError {
  constructor(functionName) {
    super(`Unknown function: ${functionName}`);
  }
}
class JoinCollectionNotFoundError extends QueryCompilationError {
  constructor(collectionId) {
    super(`Collection "${collectionId}" not found during compilation of join`);
  }
}
class JoinError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `JoinError`;
  }
}
class UnsupportedJoinTypeError extends JoinError {
  constructor(joinType) {
    super(`Unsupported join type: ${joinType}`);
  }
}
class InvalidJoinConditionSameSourceError extends JoinError {
  constructor(sourceAlias) {
    super(
      `Invalid join condition: both expressions refer to the same source "${sourceAlias}"`
    );
  }
}
class InvalidJoinConditionSourceMismatchError extends JoinError {
  constructor() {
    super(`Invalid join condition: expressions must reference source aliases`);
  }
}
class InvalidJoinConditionLeftSourceError extends JoinError {
  constructor(sourceAlias) {
    super(
      `Invalid join condition: left expression refers to an unavailable source "${sourceAlias}"`
    );
  }
}
class InvalidJoinConditionRightSourceError extends JoinError {
  constructor(sourceAlias) {
    super(
      `Invalid join condition: right expression does not refer to the joined source "${sourceAlias}"`
    );
  }
}
class InvalidJoinCondition extends JoinError {
  constructor() {
    super(`Invalid join condition`);
  }
}
class UnsupportedJoinSourceTypeError extends JoinError {
  constructor(type) {
    super(`Unsupported join source type: ${type}`);
  }
}
class GroupByError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `GroupByError`;
  }
}
class NonAggregateExpressionNotInGroupByError extends GroupByError {
  constructor(alias) {
    super(
      `Non-aggregate expression '${alias}' in SELECT must also appear in GROUP BY clause`
    );
  }
}
class UnsupportedAggregateFunctionError extends GroupByError {
  constructor(functionName) {
    super(`Unsupported aggregate function: ${functionName}`);
  }
}
class AggregateFunctionNotInSelectError extends GroupByError {
  constructor(functionName) {
    super(
      `Aggregate function in HAVING clause must also be in SELECT clause: ${functionName}`
    );
  }
}
class UnknownHavingExpressionTypeError extends GroupByError {
  constructor(type) {
    super(`Unknown expression type in HAVING clause: ${type}`);
  }
}
class SyncCleanupError extends TanStackDBError {
  constructor(collectionId, error) {
    const message = error instanceof Error ? error.message : String(error);
    super(
      `Collection "${collectionId}" sync cleanup function threw an error: ${message}`
    );
    this.name = `SyncCleanupError`;
  }
}
class QueryOptimizerError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryOptimizerError`;
  }
}
class CannotCombineEmptyExpressionListError extends QueryOptimizerError {
  constructor() {
    super(`Cannot combine empty expression list`);
  }
}
class SubscriptionNotFoundError extends QueryCompilationError {
  constructor(resolvedAlias, originalAlias, collectionId, availableAliases) {
    super(
      `Internal error: subscription for alias '${resolvedAlias}' (remapped from '${originalAlias}', collection '${collectionId}') is missing in join pipeline. Available aliases: ${availableAliases.join(`, `)}. This indicates a bug in alias tracking.`
    );
  }
}
class MissingAliasInputsError extends QueryCompilationError {
  constructor(missingAliases) {
    super(
      `Internal error: compiler returned aliases without inputs: ${missingAliases.join(`, `)}. This indicates a bug in query compilation. Please report this issue.`
    );
  }
}
class SetWindowRequiresOrderByError extends QueryCompilationError {
  constructor() {
    super(
      `setWindow() can only be called on collections with an ORDER BY clause. Add .orderBy() to your query to enable window movement.`
    );
  }
}
const objectIds = /* @__PURE__ */ new WeakMap();
let nextObjectId = 1;
function getObjectId(obj) {
  if (objectIds.has(obj)) {
    return objectIds.get(obj);
  }
  const id = nextObjectId++;
  objectIds.set(obj, id);
  return id;
}
const ascComparator = (a, b, opts) => {
  const { nulls } = opts;
  if (a == null && b == null) return 0;
  if (a == null) return nulls === `first` ? -1 : 1;
  if (b == null) return nulls === `first` ? 1 : -1;
  if (typeof a === `string` && typeof b === `string`) {
    if (opts.stringSort === `locale`) {
      return a.localeCompare(b, opts.locale, opts.localeOptions);
    }
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const result = ascComparator(a[i], b[i], opts);
      if (result !== 0) {
        return result;
      }
    }
    return a.length - b.length;
  }
  if (a instanceof Date && b instanceof Date) {
    return a.getTime() - b.getTime();
  }
  const aIsObject = typeof a === `object`;
  const bIsObject = typeof b === `object`;
  if (aIsObject || bIsObject) {
    if (aIsObject && bIsObject) {
      const aId = getObjectId(a);
      const bId = getObjectId(b);
      return aId - bId;
    }
    if (aIsObject) return 1;
    if (bIsObject) return -1;
  }
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
};
const descComparator = (a, b, opts) => {
  return ascComparator(b, a, {
    ...opts,
    nulls: opts.nulls === `first` ? `last` : `first`
  });
};
function makeComparator(opts) {
  return (a, b) => {
    if (opts.direction === `asc`) {
      return ascComparator(a, b, opts);
    } else {
      return descComparator(a, b, opts);
    }
  };
}
const defaultComparator = makeComparator({
  direction: `asc`,
  nulls: `first`,
  stringSort: `locale`
});
function areUint8ArraysEqual(a, b) {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) {
      return false;
    }
  }
  return true;
}
const UINT8ARRAY_NORMALIZE_THRESHOLD = 128;
const UNDEFINED_SENTINEL = `__TS_DB_BTREE_UNDEFINED_VALUE__`;
function normalizeValue(value) {
  if (value instanceof Date) {
    return value.getTime();
  }
  const isUint8Array = typeof Buffer !== `undefined` && value instanceof Buffer || value instanceof Uint8Array;
  if (isUint8Array) {
    if (value.byteLength <= UINT8ARRAY_NORMALIZE_THRESHOLD) {
      return `__u8__${Array.from(value).join(`,`)}`;
    }
  }
  return value;
}
function normalizeForBTree(value) {
  if (value === void 0) {
    return UNDEFINED_SENTINEL;
  }
  return normalizeValue(value);
}
function denormalizeUndefined(value) {
  if (value === UNDEFINED_SENTINEL) {
    return void 0;
  }
  return value;
}
function areValuesEqual(a, b) {
  if (a === b) {
    return true;
  }
  const aIsUint8Array = typeof Buffer !== `undefined` && a instanceof Buffer || a instanceof Uint8Array;
  const bIsUint8Array = typeof Buffer !== `undefined` && b instanceof Buffer || b instanceof Uint8Array;
  if (aIsUint8Array && bIsUint8Array) {
    return areUint8ArraysEqual(a, b);
  }
  return false;
}
function isUnknown(value) {
  return value === null || value === void 0;
}
function toBooleanPredicate(result) {
  return result === true;
}
function compileExpression(expr, isSingleRow = false) {
  const compiledFn = compileExpressionInternal(expr, isSingleRow);
  return compiledFn;
}
function compileSingleRowExpression(expr) {
  const compiledFn = compileExpressionInternal(expr, true);
  return compiledFn;
}
function compileExpressionInternal(expr, isSingleRow) {
  switch (expr.type) {
    case `val`: {
      const value = expr.value;
      return () => value;
    }
    case `ref`: {
      return isSingleRow ? compileSingleRowRef(expr) : compileRef(expr);
    }
    case `func`: {
      return compileFunction(expr, isSingleRow);
    }
    default:
      throw new UnknownExpressionTypeError(expr.type);
  }
}
function compileRef(ref) {
  const [namespace, ...propertyPath] = ref.path;
  if (!namespace) {
    throw new EmptyReferencePathError();
  }
  if (namespace === `$selected`) {
    if (propertyPath.length === 0) {
      return (namespacedRow) => namespacedRow.$selected;
    } else if (propertyPath.length === 1) {
      const prop = propertyPath[0];
      return (namespacedRow) => {
        const selectResults = namespacedRow.$selected;
        return selectResults?.[prop];
      };
    } else {
      return (namespacedRow) => {
        const selectResults = namespacedRow.$selected;
        if (selectResults === void 0) {
          return void 0;
        }
        let value = selectResults;
        for (const prop of propertyPath) {
          if (value == null) {
            return value;
          }
          value = value[prop];
        }
        return value;
      };
    }
  }
  const tableAlias = namespace;
  if (propertyPath.length === 0) {
    return (namespacedRow) => namespacedRow[tableAlias];
  } else if (propertyPath.length === 1) {
    const prop = propertyPath[0];
    return (namespacedRow) => {
      const tableData = namespacedRow[tableAlias];
      return tableData?.[prop];
    };
  } else {
    return (namespacedRow) => {
      const tableData = namespacedRow[tableAlias];
      if (tableData === void 0) {
        return void 0;
      }
      let value = tableData;
      for (const prop of propertyPath) {
        if (value == null) {
          return value;
        }
        value = value[prop];
      }
      return value;
    };
  }
}
function compileSingleRowRef(ref) {
  const propertyPath = ref.path;
  return (item) => {
    let value = item;
    for (const prop of propertyPath) {
      if (value == null) {
        return value;
      }
      value = value[prop];
    }
    return value;
  };
}
function compileFunction(func, isSingleRow) {
  const compiledArgs = func.args.map(
    (arg) => compileExpressionInternal(arg, isSingleRow)
  );
  switch (func.name) {
    // Comparison operators
    case `eq`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = normalizeValue(argA(data));
        const b = normalizeValue(argB(data));
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return areValuesEqual(a, b);
      };
    }
    case `gt`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a > b;
      };
    }
    case `gte`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a >= b;
      };
    }
    case `lt`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a < b;
      };
    }
    case `lte`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        if (isUnknown(a) || isUnknown(b)) {
          return null;
        }
        return a <= b;
      };
    }
    // Boolean operators
    case `and`:
      return (data) => {
        let hasUnknown = false;
        for (const compiledArg of compiledArgs) {
          const result = compiledArg(data);
          if (result === false) {
            return false;
          }
          if (isUnknown(result)) {
            hasUnknown = true;
          }
        }
        if (hasUnknown) {
          return null;
        }
        return true;
      };
    case `or`:
      return (data) => {
        let hasUnknown = false;
        for (const compiledArg of compiledArgs) {
          const result = compiledArg(data);
          if (result === true) {
            return true;
          }
          if (isUnknown(result)) {
            hasUnknown = true;
          }
        }
        if (hasUnknown) {
          return null;
        }
        return false;
      };
    case `not`: {
      const arg = compiledArgs[0];
      return (data) => {
        const result = arg(data);
        if (isUnknown(result)) {
          return null;
        }
        return !result;
      };
    }
    // Array operators
    case `in`: {
      const valueEvaluator = compiledArgs[0];
      const arrayEvaluator = compiledArgs[1];
      return (data) => {
        const value = normalizeValue(valueEvaluator(data));
        const array = arrayEvaluator(data);
        if (isUnknown(value)) {
          return null;
        }
        if (!Array.isArray(array)) {
          return false;
        }
        return array.some((item) => normalizeValue(item) === value);
      };
    }
    // String operators
    case `like`: {
      const valueEvaluator = compiledArgs[0];
      const patternEvaluator = compiledArgs[1];
      return (data) => {
        const value = valueEvaluator(data);
        const pattern = patternEvaluator(data);
        if (isUnknown(value) || isUnknown(pattern)) {
          return null;
        }
        return evaluateLike(value, pattern, false);
      };
    }
    case `ilike`: {
      const valueEvaluator = compiledArgs[0];
      const patternEvaluator = compiledArgs[1];
      return (data) => {
        const value = valueEvaluator(data);
        const pattern = patternEvaluator(data);
        if (isUnknown(value) || isUnknown(pattern)) {
          return null;
        }
        return evaluateLike(value, pattern, true);
      };
    }
    // String functions
    case `upper`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return typeof value === `string` ? value.toUpperCase() : value;
      };
    }
    case `lower`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return typeof value === `string` ? value.toLowerCase() : value;
      };
    }
    case `length`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        if (typeof value === `string`) {
          return value.length;
        }
        if (Array.isArray(value)) {
          return value.length;
        }
        return 0;
      };
    }
    case `concat`:
      return (data) => {
        return compiledArgs.map((evaluator) => {
          const arg = evaluator(data);
          try {
            return String(arg ?? ``);
          } catch {
            try {
              return JSON.stringify(arg) || ``;
            } catch {
              return `[object]`;
            }
          }
        }).join(``);
      };
    case `coalesce`:
      return (data) => {
        for (const evaluator of compiledArgs) {
          const value = evaluator(data);
          if (value !== null && value !== void 0) {
            return value;
          }
        }
        return null;
      };
    // Math functions
    case `add`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        return (a ?? 0) + (b ?? 0);
      };
    }
    case `subtract`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        return (a ?? 0) - (b ?? 0);
      };
    }
    case `multiply`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        return (a ?? 0) * (b ?? 0);
      };
    }
    case `divide`: {
      const argA = compiledArgs[0];
      const argB = compiledArgs[1];
      return (data) => {
        const a = argA(data);
        const b = argB(data);
        const divisor = b ?? 0;
        return divisor !== 0 ? (a ?? 0) / divisor : null;
      };
    }
    // Null/undefined checking functions
    case `isUndefined`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return value === void 0;
      };
    }
    case `isNull`: {
      const arg = compiledArgs[0];
      return (data) => {
        const value = arg(data);
        return value === null;
      };
    }
    default:
      throw new UnknownFunctionError(func.name);
  }
}
function evaluateLike(value, pattern, caseInsensitive) {
  if (typeof value !== `string` || typeof pattern !== `string`) {
    return false;
  }
  const searchValue = caseInsensitive ? value.toLowerCase() : value;
  const searchPattern = caseInsensitive ? pattern.toLowerCase() : pattern;
  let regexPattern = searchPattern.replace(/[.*+?^${}()|[\]\\]/g, `\\$&`);
  regexPattern = regexPattern.replace(/%/g, `.*`);
  regexPattern = regexPattern.replace(/_/g, `.`);
  const regex = new RegExp(`^${regexPattern}$`, "s");
  return regex.test(searchValue);
}
function deepEquals(a, b) {
  return deepEqualsInternal(a, b, /* @__PURE__ */ new Map());
}
function deepEqualsInternal(a, b, visited) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;
  if (a instanceof Date) {
    if (!(b instanceof Date)) return false;
    return a.getTime() === b.getTime();
  }
  if (b instanceof Date) return false;
  if (a instanceof RegExp) {
    if (!(b instanceof RegExp)) return false;
    return a.source === b.source && a.flags === b.flags;
  }
  if (b instanceof RegExp) return false;
  if (a instanceof Map) {
    if (!(b instanceof Map)) return false;
    if (a.size !== b.size) return false;
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const entries = Array.from(a.entries());
    const result = entries.every(([key, val]) => {
      return b.has(key) && deepEqualsInternal(val, b.get(key), visited);
    });
    visited.delete(a);
    return result;
  }
  if (b instanceof Map) return false;
  if (a instanceof Set) {
    if (!(b instanceof Set)) return false;
    if (a.size !== b.size) return false;
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const aValues = Array.from(a);
    const bValues = Array.from(b);
    if (aValues.every((val) => typeof val !== `object`)) {
      visited.delete(a);
      return aValues.every((val) => b.has(val));
    }
    const result = aValues.length === bValues.length;
    visited.delete(a);
    return result;
  }
  if (b instanceof Set) return false;
  if (ArrayBuffer.isView(a) && ArrayBuffer.isView(b) && !(a instanceof DataView) && !(b instanceof DataView)) {
    const typedA = a;
    const typedB = b;
    if (typedA.length !== typedB.length) return false;
    for (let i = 0; i < typedA.length; i++) {
      if (typedA[i] !== typedB[i]) return false;
    }
    return true;
  }
  if (ArrayBuffer.isView(b) && !(b instanceof DataView) && !ArrayBuffer.isView(a)) {
    return false;
  }
  if (isTemporal(a) && isTemporal(b)) {
    const aTag = getStringTag(a);
    const bTag = getStringTag(b);
    if (aTag !== bTag) return false;
    if (typeof a.equals === `function`) {
      return a.equals(b);
    }
    return a.toString() === b.toString();
  }
  if (isTemporal(b)) return false;
  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const result = a.every(
      (item, index) => deepEqualsInternal(item, b[index], visited)
    );
    visited.delete(a);
    return result;
  }
  if (Array.isArray(b)) return false;
  if (typeof a === `object`) {
    if (visited.has(a)) {
      return visited.get(a) === b;
    }
    visited.set(a, b);
    const keysA = Object.keys(a);
    const keysB = Object.keys(b);
    if (keysA.length !== keysB.length) {
      visited.delete(a);
      return false;
    }
    const result = keysA.every(
      (key) => key in b && deepEqualsInternal(a[key], b[key], visited)
    );
    visited.delete(a);
    return result;
  }
  return false;
}
const temporalTypes = [
  `Temporal.Duration`,
  `Temporal.Instant`,
  `Temporal.PlainDate`,
  `Temporal.PlainDateTime`,
  `Temporal.PlainMonthDay`,
  `Temporal.PlainTime`,
  `Temporal.PlainYearMonth`,
  `Temporal.ZonedDateTime`
];
function getStringTag(a) {
  return a[Symbol.toStringTag];
}
function isTemporal(a) {
  const tag = getStringTag(a);
  return typeof tag === `string` && temporalTypes.includes(tag);
}
const DEFAULT_COMPARE_OPTIONS = {
  direction: `asc`,
  nulls: `first`,
  stringSort: `locale`
};
class ReverseIndex {
  constructor(index) {
    this.originalIndex = index;
  }
  // Define the reversed operations
  lookup(operation, value) {
    const reverseOperation = operation === `gt` ? `lt` : operation === `gte` ? `lte` : operation === `lt` ? `gt` : operation === `lte` ? `gte` : operation;
    return this.originalIndex.lookup(reverseOperation, value);
  }
  rangeQuery(options = {}) {
    return this.originalIndex.rangeQueryReversed(options);
  }
  rangeQueryReversed(options = {}) {
    return this.originalIndex.rangeQuery(options);
  }
  take(n, from, filterFn) {
    return this.originalIndex.takeReversed(n, from, filterFn);
  }
  takeFromStart(n, filterFn) {
    return this.originalIndex.takeReversedFromEnd(n, filterFn);
  }
  takeReversed(n, from, filterFn) {
    return this.originalIndex.take(n, from, filterFn);
  }
  takeReversedFromEnd(n, filterFn) {
    return this.originalIndex.takeFromStart(n, filterFn);
  }
  get orderedEntriesArray() {
    return this.originalIndex.orderedEntriesArrayReversed;
  }
  get orderedEntriesArrayReversed() {
    return this.originalIndex.orderedEntriesArray;
  }
  // All operations below delegate to the original index
  supports(operation) {
    return this.originalIndex.supports(operation);
  }
  matchesField(fieldPath) {
    return this.originalIndex.matchesField(fieldPath);
  }
  matchesCompareOptions(compareOptions) {
    return this.originalIndex.matchesCompareOptions(compareOptions);
  }
  matchesDirection(direction) {
    return this.originalIndex.matchesDirection(direction);
  }
  getStats() {
    return this.originalIndex.getStats();
  }
  add(key, item) {
    this.originalIndex.add(key, item);
  }
  remove(key, item) {
    this.originalIndex.remove(key, item);
  }
  update(key, oldItem, newItem) {
    this.originalIndex.update(key, oldItem, newItem);
  }
  build(entries) {
    this.originalIndex.build(entries);
  }
  clear() {
    this.originalIndex.clear();
  }
  get keyCount() {
    return this.originalIndex.keyCount;
  }
  equalityLookup(value) {
    return this.originalIndex.equalityLookup(value);
  }
  inArrayLookup(values) {
    return this.originalIndex.inArrayLookup(values);
  }
  get indexedKeysSet() {
    return this.originalIndex.indexedKeysSet;
  }
  get valueMapData() {
    return this.originalIndex.valueMapData;
  }
}
function findIndexForField(collection, fieldPath, compareOptions) {
  const compareOpts = compareOptions ?? {
    ...DEFAULT_COMPARE_OPTIONS,
    ...collection.compareOptions
  };
  for (const index of collection.indexes.values()) {
    if (index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts)) {
      if (!index.matchesDirection(compareOpts.direction)) {
        return new ReverseIndex(index);
      }
      return index;
    }
  }
  return void 0;
}
function intersectSets(sets) {
  if (sets.length === 0) return /* @__PURE__ */ new Set();
  if (sets.length === 1) return new Set(sets[0]);
  let result = new Set(sets[0]);
  for (let i = 1; i < sets.length; i++) {
    const newResult = /* @__PURE__ */ new Set();
    for (const item of result) {
      if (sets[i].has(item)) {
        newResult.add(item);
      }
    }
    result = newResult;
  }
  return result;
}
function unionSets(sets) {
  const result = /* @__PURE__ */ new Set();
  for (const set of sets) {
    for (const item of set) {
      result.add(item);
    }
  }
  return result;
}
function optimizeExpressionWithIndexes(expression, collection) {
  return optimizeQueryRecursive(expression, collection);
}
function optimizeQueryRecursive(expression, collection) {
  if (expression.type === `func`) {
    switch (expression.name) {
      case `eq`:
      case `gt`:
      case `gte`:
      case `lt`:
      case `lte`:
        return optimizeSimpleComparison(expression, collection);
      case `and`:
        return optimizeAndExpression(expression, collection);
      case `or`:
        return optimizeOrExpression(expression, collection);
      case `in`:
        return optimizeInArrayExpression(expression, collection);
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeCompoundRangeQuery(expression, collection) {
  if (expression.type !== `func` || expression.args.length < 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const fieldOperations = /* @__PURE__ */ new Map();
  for (const arg of expression.args) {
    if (arg.type === `func` && [`gt`, `gte`, `lt`, `lte`].includes(arg.name)) {
      const rangeOp = arg;
      if (rangeOp.args.length === 2) {
        const leftArg = rangeOp.args[0];
        const rightArg = rangeOp.args[1];
        let fieldArg = null;
        let valueArg = null;
        let operation = rangeOp.name;
        if (leftArg.type === `ref` && rightArg.type === `val`) {
          fieldArg = leftArg;
          valueArg = rightArg;
        } else if (leftArg.type === `val` && rightArg.type === `ref`) {
          fieldArg = rightArg;
          valueArg = leftArg;
          switch (operation) {
            case `gt`:
              operation = `lt`;
              break;
            case `gte`:
              operation = `lte`;
              break;
            case `lt`:
              operation = `gt`;
              break;
            case `lte`:
              operation = `gte`;
              break;
          }
        }
        if (fieldArg && valueArg) {
          const fieldPath = fieldArg.path;
          const fieldKey = fieldPath.join(`.`);
          const value = valueArg.value;
          if (!fieldOperations.has(fieldKey)) {
            fieldOperations.set(fieldKey, []);
          }
          fieldOperations.get(fieldKey).push({ operation, value });
        }
      }
    }
  }
  for (const [fieldKey, operations] of fieldOperations) {
    if (operations.length >= 2) {
      const fieldPath = fieldKey.split(`.`);
      const index = findIndexForField(collection, fieldPath);
      if (index && index.supports(`gt`) && index.supports(`lt`)) {
        let from = void 0;
        let to = void 0;
        let fromInclusive = true;
        let toInclusive = true;
        for (const { operation, value } of operations) {
          switch (operation) {
            case `gt`:
              if (from === void 0 || value > from) {
                from = value;
                fromInclusive = false;
              }
              break;
            case `gte`:
              if (from === void 0 || value > from) {
                from = value;
                fromInclusive = true;
              }
              break;
            case `lt`:
              if (to === void 0 || value < to) {
                to = value;
                toInclusive = false;
              }
              break;
            case `lte`:
              if (to === void 0 || value < to) {
                to = value;
                toInclusive = true;
              }
              break;
          }
        }
        const matchingKeys = index.rangeQuery({
          from,
          to,
          fromInclusive,
          toInclusive
        });
        return { canOptimize: true, matchingKeys };
      }
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeSimpleComparison(expression, collection) {
  if (expression.type !== `func` || expression.args.length !== 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const leftArg = expression.args[0];
  const rightArg = expression.args[1];
  let fieldArg = null;
  let valueArg = null;
  let operation = expression.name;
  if (leftArg.type === `ref` && rightArg.type === `val`) {
    fieldArg = leftArg;
    valueArg = rightArg;
  } else if (leftArg.type === `val` && rightArg.type === `ref`) {
    fieldArg = rightArg;
    valueArg = leftArg;
    switch (operation) {
      case `gt`:
        operation = `lt`;
        break;
      case `gte`:
        operation = `lte`;
        break;
      case `lt`:
        operation = `gt`;
        break;
      case `lte`:
        operation = `gte`;
        break;
    }
  }
  if (fieldArg && valueArg) {
    const fieldPath = fieldArg.path;
    const index = findIndexForField(collection, fieldPath);
    if (index) {
      const queryValue = valueArg.value;
      const indexOperation = operation;
      if (!index.supports(indexOperation)) {
        return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
      }
      const matchingKeys = index.lookup(indexOperation, queryValue);
      return { canOptimize: true, matchingKeys };
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeAndExpression(expression, collection) {
  if (expression.type !== `func` || expression.args.length < 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const compoundRangeResult = optimizeCompoundRangeQuery(expression, collection);
  if (compoundRangeResult.canOptimize) {
    return compoundRangeResult;
  }
  const results = [];
  for (const arg of expression.args) {
    const result = optimizeQueryRecursive(arg, collection);
    if (result.canOptimize) {
      results.push(result);
    }
  }
  if (results.length > 0) {
    const allMatchingSets = results.map((r) => r.matchingKeys);
    const intersectedKeys = intersectSets(allMatchingSets);
    return { canOptimize: true, matchingKeys: intersectedKeys };
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeOrExpression(expression, collection) {
  if (expression.type !== `func` || expression.args.length < 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const results = [];
  for (const arg of expression.args) {
    const result = optimizeQueryRecursive(arg, collection);
    if (result.canOptimize) {
      results.push(result);
    }
  }
  if (results.length > 0) {
    const allMatchingSets = results.map((r) => r.matchingKeys);
    const unionedKeys = unionSets(allMatchingSets);
    return { canOptimize: true, matchingKeys: unionedKeys };
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
function optimizeInArrayExpression(expression, collection) {
  if (expression.type !== `func` || expression.args.length !== 2) {
    return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
  }
  const fieldArg = expression.args[0];
  const arrayArg = expression.args[1];
  if (fieldArg.type === `ref` && arrayArg.type === `val` && Array.isArray(arrayArg.value)) {
    const fieldPath = fieldArg.path;
    const values = arrayArg.value;
    const index = findIndexForField(collection, fieldPath);
    if (index) {
      if (index.supports(`in`)) {
        const matchingKeys = index.lookup(`in`, values);
        return { canOptimize: true, matchingKeys };
      } else if (index.supports(`eq`)) {
        const matchingKeys = /* @__PURE__ */ new Set();
        for (const value of values) {
          const keysForValue = index.lookup(`eq`, value);
          for (const key of keysForValue) {
            matchingKeys.add(key);
          }
        }
        return { canOptimize: true, matchingKeys };
      }
    }
  }
  return { canOptimize: false, matchingKeys: /* @__PURE__ */ new Set() };
}
class BTree {
  /**
   * Initializes an empty B+ tree.
   * @param compare Custom function to compare pairs of elements in the tree.
   *   If not specified, defaultComparator will be used which is valid as long as K extends DefaultComparable.
   * @param entries A set of key-value pairs to initialize the tree
   * @param maxNodeSize Branching factor (maximum items or children per node)
   *   Must be in range 4..256. If undefined or <4 then default is used; if >256 then 256.
   */
  constructor(compare, entries, maxNodeSize) {
    this._root = EmptyLeaf;
    this._size = 0;
    this._maxNodeSize = maxNodeSize >= 4 ? Math.min(maxNodeSize, 256) : 32;
    this._compare = compare;
    if (entries) this.setPairs(entries);
  }
  // ///////////////////////////////////////////////////////////////////////////
  // ES6 Map<K,V> methods /////////////////////////////////////////////////////
  /** Gets the number of key-value pairs in the tree. */
  get size() {
    return this._size;
  }
  /** Gets the number of key-value pairs in the tree. */
  get length() {
    return this._size;
  }
  /** Returns true iff the tree contains no key-value pairs. */
  get isEmpty() {
    return this._size === 0;
  }
  /** Releases the tree so that its size is 0. */
  clear() {
    this._root = EmptyLeaf;
    this._size = 0;
  }
  /**
   * Finds a pair in the tree and returns the associated value.
   * @param defaultValue a value to return if the key was not found.
   * @returns the value, or defaultValue if the key was not found.
   * @description Computational complexity: O(log size)
   */
  get(key, defaultValue) {
    return this._root.get(key, defaultValue, this);
  }
  /**
   * Adds or overwrites a key-value pair in the B+ tree.
   * @param key the key is used to determine the sort order of
   *        data in the tree.
   * @param value data to associate with the key (optional)
   * @param overwrite Whether to overwrite an existing key-value pair
   *        (default: true). If this is false and there is an existing
   *        key-value pair then this method has no effect.
   * @returns true if a new key-value pair was added.
   * @description Computational complexity: O(log size)
   * Note: when overwriting a previous entry, the key is updated
   * as well as the value. This has no effect unless the new key
   * has data that does not affect its sort order.
   */
  set(key, value, overwrite) {
    if (this._root.isShared) this._root = this._root.clone();
    const result = this._root.set(key, value, overwrite, this);
    if (result === true || result === false) return result;
    this._root = new BNodeInternal([this._root, result]);
    return true;
  }
  /**
   * Returns true if the key exists in the B+ tree, false if not.
   * Use get() for best performance; use has() if you need to
   * distinguish between "undefined value" and "key not present".
   * @param key Key to detect
   * @description Computational complexity: O(log size)
   */
  has(key) {
    return this.forRange(key, key, true, void 0) !== 0;
  }
  /**
   * Removes a single key-value pair from the B+ tree.
   * @param key Key to find
   * @returns true if a pair was found and removed, false otherwise.
   * @description Computational complexity: O(log size)
   */
  delete(key) {
    return this.editRange(key, key, true, DeleteRange) !== 0;
  }
  // ///////////////////////////////////////////////////////////////////////////
  // Additional methods ///////////////////////////////////////////////////////
  /** Returns the maximum number of children/values before nodes will split. */
  get maxNodeSize() {
    return this._maxNodeSize;
  }
  /** Gets the lowest key in the tree. Complexity: O(log size) */
  minKey() {
    return this._root.minKey();
  }
  /** Gets the highest key in the tree. Complexity: O(1) */
  maxKey() {
    return this._root.maxKey();
  }
  /** Gets an array of all keys, sorted */
  keysArray() {
    const results = [];
    this._root.forRange(
      this.minKey(),
      this.maxKey(),
      true,
      false,
      this,
      0,
      (k, _v) => {
        results.push(k);
      }
    );
    return results;
  }
  /** Returns the next pair whose key is larger than the specified key (or undefined if there is none).
   * If key === undefined, this function returns the lowest pair.
   * @param key The key to search for.
   * @param reusedArray Optional array used repeatedly to store key-value pairs, to
   * avoid creating a new array on every iteration.
   */
  nextHigherPair(key, reusedArray) {
    reusedArray = reusedArray || [];
    if (key === void 0) {
      return this._root.minPair(reusedArray);
    }
    return this._root.getPairOrNextHigher(
      key,
      this._compare,
      false,
      reusedArray
    );
  }
  /** Returns the next key larger than the specified key, or undefined if there is none.
   *  Also, nextHigherKey(undefined) returns the lowest key.
   */
  nextHigherKey(key) {
    const p = this.nextHigherPair(key, ReusedArray);
    return p && p[0];
  }
  /** Returns the next pair whose key is smaller than the specified key (or undefined if there is none).
   *  If key === undefined, this function returns the highest pair.
   * @param key The key to search for.
   * @param reusedArray Optional array used repeatedly to store key-value pairs, to
   *        avoid creating a new array each time you call this method.
   */
  nextLowerPair(key, reusedArray) {
    reusedArray = reusedArray || [];
    if (key === void 0) {
      return this._root.maxPair(reusedArray);
    }
    return this._root.getPairOrNextLower(key, this._compare, false, reusedArray);
  }
  /** Returns the next key smaller than the specified key, or undefined if there is none.
   *  Also, nextLowerKey(undefined) returns the highest key.
   */
  nextLowerKey(key) {
    const p = this.nextLowerPair(key, ReusedArray);
    return p && p[0];
  }
  /** Adds all pairs from a list of key-value pairs.
   * @param pairs Pairs to add to this tree. If there are duplicate keys,
   *        later pairs currently overwrite earlier ones (e.g. [[0,1],[0,7]]
   *        associates 0 with 7.)
   * @param overwrite Whether to overwrite pairs that already exist (if false,
   *        pairs[i] is ignored when the key pairs[i][0] already exists.)
   * @returns The number of pairs added to the collection.
   * @description Computational complexity: O(pairs.length * log(size + pairs.length))
   */
  setPairs(pairs, overwrite) {
    let added = 0;
    for (const pair of pairs) {
      if (this.set(pair[0], pair[1], overwrite)) added++;
    }
    return added;
  }
  /**
   * Scans the specified range of keys, in ascending order by key.
   * Note: the callback `onFound` must not insert or remove items in the
   * collection. Doing so may cause incorrect data to be sent to the
   * callback afterward.
   * @param low The first key scanned will be greater than or equal to `low`.
   * @param high Scanning stops when a key larger than this is reached.
   * @param includeHigh If the `high` key is present, `onFound` is called for
   *        that final pair if and only if this parameter is true.
   * @param onFound A function that is called for each key-value pair. This
   *        function can return {break:R} to stop early with result R.
   * @param initialCounter Initial third argument of onFound. This value
   *        increases by one each time `onFound` is called. Default: 0
   * @returns The number of values found, or R if the callback returned
   *        `{break:R}` to stop early.
   * @description Computational complexity: O(number of items scanned + log size)
   */
  forRange(low, high, includeHigh, onFound, initialCounter) {
    const r = this._root.forRange(
      low,
      high,
      includeHigh,
      false,
      this,
      initialCounter || 0,
      onFound
    );
    return typeof r === `number` ? r : r.break;
  }
  /**
   * Scans and potentially modifies values for a subsequence of keys.
   * Note: the callback `onFound` should ideally be a pure function.
   *   Specfically, it must not insert items, call clone(), or change
   *   the collection except via return value; out-of-band editing may
   *   cause an exception or may cause incorrect data to be sent to
   *   the callback (duplicate or missed items). It must not cause a
   *   clone() of the collection, otherwise the clone could be modified
   *   by changes requested by the callback.
   * @param low The first key scanned will be greater than or equal to `low`.
   * @param high Scanning stops when a key larger than this is reached.
   * @param includeHigh If the `high` key is present, `onFound` is called for
   *        that final pair if and only if this parameter is true.
   * @param onFound A function that is called for each key-value pair. This
   *        function can return `{value:v}` to change the value associated
   *        with the current key, `{delete:true}` to delete the current pair,
   *        `{break:R}` to stop early with result R, or it can return nothing
   *        (undefined or {}) to cause no effect and continue iterating.
   *        `{break:R}` can be combined with one of the other two commands.
   *        The third argument `counter` is the number of items iterated
   *        previously; it equals 0 when `onFound` is called the first time.
   * @returns The number of values scanned, or R if the callback returned
   *        `{break:R}` to stop early.
   * @description
   *   Computational complexity: O(number of items scanned + log size)
   *   Note: if the tree has been cloned with clone(), any shared
   *   nodes are copied before `onFound` is called. This takes O(n) time
   *   where n is proportional to the amount of shared data scanned.
   */
  editRange(low, high, includeHigh, onFound, initialCounter) {
    let root = this._root;
    if (root.isShared) this._root = root = root.clone();
    try {
      const r = root.forRange(
        low,
        high,
        includeHigh,
        true,
        this,
        initialCounter || 0,
        onFound
      );
      return typeof r === `number` ? r : r.break;
    } finally {
      let isShared;
      while (root.keys.length <= 1 && !root.isLeaf) {
        isShared ||= root.isShared;
        this._root = root = root.keys.length === 0 ? EmptyLeaf : root.children[0];
      }
      if (isShared) {
        root.isShared = true;
      }
    }
  }
}
class BNode {
  get isLeaf() {
    return this.children === void 0;
  }
  constructor(keys = [], values) {
    this.keys = keys;
    this.values = values || undefVals;
    this.isShared = void 0;
  }
  // /////////////////////////////////////////////////////////////////////////
  // Shared methods /////////////////////////////////////////////////////////
  maxKey() {
    return this.keys[this.keys.length - 1];
  }
  // If key not found, returns i^failXor where i is the insertion index.
  // Callers that don't care whether there was a match will set failXor=0.
  indexOf(key, failXor, cmp) {
    const keys = this.keys;
    let lo = 0, hi = keys.length, mid = hi >> 1;
    while (lo < hi) {
      const c = cmp(keys[mid], key);
      if (c < 0) lo = mid + 1;
      else if (c > 0)
        hi = mid;
      else if (c === 0) return mid;
      else {
        if (key === key)
          return keys.length;
        else throw new Error(`BTree: NaN was used as a key`);
      }
      mid = lo + hi >> 1;
    }
    return mid ^ failXor;
  }
  // ///////////////////////////////////////////////////////////////////////////
  // Leaf Node: misc //////////////////////////////////////////////////////////
  minKey() {
    return this.keys[0];
  }
  minPair(reusedArray) {
    if (this.keys.length === 0) return void 0;
    reusedArray[0] = this.keys[0];
    reusedArray[1] = this.values[0];
    return reusedArray;
  }
  maxPair(reusedArray) {
    if (this.keys.length === 0) return void 0;
    const lastIndex = this.keys.length - 1;
    reusedArray[0] = this.keys[lastIndex];
    reusedArray[1] = this.values[lastIndex];
    return reusedArray;
  }
  clone() {
    const v = this.values;
    return new BNode(this.keys.slice(0), v === undefVals ? v : v.slice(0));
  }
  get(key, defaultValue, tree) {
    const i = this.indexOf(key, -1, tree._compare);
    return i < 0 ? defaultValue : this.values[i];
  }
  getPairOrNextLower(key, compare, inclusive, reusedArray) {
    const i = this.indexOf(key, -1, compare);
    const indexOrLower = i < 0 ? ~i - 1 : inclusive ? i : i - 1;
    if (indexOrLower >= 0) {
      reusedArray[0] = this.keys[indexOrLower];
      reusedArray[1] = this.values[indexOrLower];
      return reusedArray;
    }
    return void 0;
  }
  getPairOrNextHigher(key, compare, inclusive, reusedArray) {
    const i = this.indexOf(key, -1, compare);
    const indexOrLower = i < 0 ? ~i : inclusive ? i : i + 1;
    const keys = this.keys;
    if (indexOrLower < keys.length) {
      reusedArray[0] = keys[indexOrLower];
      reusedArray[1] = this.values[indexOrLower];
      return reusedArray;
    }
    return void 0;
  }
  // ///////////////////////////////////////////////////////////////////////////
  // Leaf Node: set & node splitting //////////////////////////////////////////
  set(key, value, overwrite, tree) {
    let i = this.indexOf(key, -1, tree._compare);
    if (i < 0) {
      i = ~i;
      tree._size++;
      if (this.keys.length < tree._maxNodeSize) {
        return this.insertInLeaf(i, key, value, tree);
      } else {
        const newRightSibling = this.splitOffRightSide();
        let target = this;
        if (i > this.keys.length) {
          i -= this.keys.length;
          target = newRightSibling;
        }
        target.insertInLeaf(i, key, value, tree);
        return newRightSibling;
      }
    } else {
      if (overwrite !== false) {
        if (value !== void 0) this.reifyValues();
        this.keys[i] = key;
        this.values[i] = value;
      }
      return false;
    }
  }
  reifyValues() {
    if (this.values === undefVals)
      return this.values = this.values.slice(0, this.keys.length);
    return this.values;
  }
  insertInLeaf(i, key, value, tree) {
    this.keys.splice(i, 0, key);
    if (this.values === undefVals) {
      while (undefVals.length < tree._maxNodeSize) undefVals.push(void 0);
      if (value === void 0) {
        return true;
      } else {
        this.values = undefVals.slice(0, this.keys.length - 1);
      }
    }
    this.values.splice(i, 0, value);
    return true;
  }
  takeFromRight(rhs) {
    let v = this.values;
    if (rhs.values === undefVals) {
      if (v !== undefVals) v.push(void 0);
    } else {
      v = this.reifyValues();
      v.push(rhs.values.shift());
    }
    this.keys.push(rhs.keys.shift());
  }
  takeFromLeft(lhs) {
    let v = this.values;
    if (lhs.values === undefVals) {
      if (v !== undefVals) v.unshift(void 0);
    } else {
      v = this.reifyValues();
      v.unshift(lhs.values.pop());
    }
    this.keys.unshift(lhs.keys.pop());
  }
  splitOffRightSide() {
    const half = this.keys.length >> 1, keys = this.keys.splice(half);
    const values = this.values === undefVals ? undefVals : this.values.splice(half);
    return new BNode(keys, values);
  }
  // ///////////////////////////////////////////////////////////////////////////
  // Leaf Node: scanning & deletions //////////////////////////////////////////
  forRange(low, high, includeHigh, editMode, tree, count2, onFound) {
    const cmp = tree._compare;
    let iLow, iHigh;
    if (high === low) {
      if (!includeHigh) return count2;
      iHigh = (iLow = this.indexOf(low, -1, cmp)) + 1;
      if (iLow < 0) return count2;
    } else {
      iLow = this.indexOf(low, 0, cmp);
      iHigh = this.indexOf(high, -1, cmp);
      if (iHigh < 0) iHigh = ~iHigh;
      else if (includeHigh === true) iHigh++;
    }
    const keys = this.keys, values = this.values;
    if (onFound !== void 0) {
      for (let i = iLow; i < iHigh; i++) {
        const key = keys[i];
        const result = onFound(key, values[i], count2++);
        if (result !== void 0) {
          if (editMode === true) {
            if (key !== keys[i] || this.isShared === true)
              throw new Error(`BTree illegally changed or cloned in editRange`);
            if (result.delete) {
              this.keys.splice(i, 1);
              if (this.values !== undefVals) this.values.splice(i, 1);
              tree._size--;
              i--;
              iHigh--;
            } else if (result.hasOwnProperty(`value`)) {
              values[i] = result.value;
            }
          }
          if (result.break !== void 0) return result;
        }
      }
    } else count2 += iHigh - iLow;
    return count2;
  }
  /** Adds entire contents of right-hand sibling (rhs is left unchanged) */
  mergeSibling(rhs, _) {
    this.keys.push.apply(this.keys, rhs.keys);
    if (this.values === undefVals) {
      if (rhs.values === undefVals) return;
      this.values = this.values.slice(0, this.keys.length);
    }
    this.values.push.apply(this.values, rhs.reifyValues());
  }
}
class BNodeInternal extends BNode {
  /**
   * This does not mark `children` as shared, so it is the responsibility of the caller
   * to ensure children are either marked shared, or aren't included in another tree.
   */
  constructor(children, keys) {
    if (!keys) {
      keys = [];
      for (let i = 0; i < children.length; i++) keys[i] = children[i].maxKey();
    }
    super(keys);
    this.children = children;
  }
  minKey() {
    return this.children[0].minKey();
  }
  minPair(reusedArray) {
    return this.children[0].minPair(reusedArray);
  }
  maxPair(reusedArray) {
    return this.children[this.children.length - 1].maxPair(reusedArray);
  }
  get(key, defaultValue, tree) {
    const i = this.indexOf(key, 0, tree._compare), children = this.children;
    return i < children.length ? children[i].get(key, defaultValue, tree) : void 0;
  }
  getPairOrNextLower(key, compare, inclusive, reusedArray) {
    const i = this.indexOf(key, 0, compare), children = this.children;
    if (i >= children.length) return this.maxPair(reusedArray);
    const result = children[i].getPairOrNextLower(
      key,
      compare,
      inclusive,
      reusedArray
    );
    if (result === void 0 && i > 0) {
      return children[i - 1].maxPair(reusedArray);
    }
    return result;
  }
  getPairOrNextHigher(key, compare, inclusive, reusedArray) {
    const i = this.indexOf(key, 0, compare), children = this.children, length = children.length;
    if (i >= length) return void 0;
    const result = children[i].getPairOrNextHigher(
      key,
      compare,
      inclusive,
      reusedArray
    );
    if (result === void 0 && i < length - 1) {
      return children[i + 1].minPair(reusedArray);
    }
    return result;
  }
  // ///////////////////////////////////////////////////////////////////////////
  // Internal Node: set & node splitting //////////////////////////////////////
  set(key, value, overwrite, tree) {
    const c = this.children, max2 = tree._maxNodeSize, cmp = tree._compare;
    let i = Math.min(this.indexOf(key, 0, cmp), c.length - 1), child = c[i];
    if (child.isShared) c[i] = child = child.clone();
    if (child.keys.length >= max2) {
      let other;
      if (i > 0 && (other = c[i - 1]).keys.length < max2 && cmp(child.keys[0], key) < 0) {
        if (other.isShared) c[i - 1] = other = other.clone();
        other.takeFromRight(child);
        this.keys[i - 1] = other.maxKey();
      } else if ((other = c[i + 1]) !== void 0 && other.keys.length < max2 && cmp(child.maxKey(), key) < 0) {
        if (other.isShared) c[i + 1] = other = other.clone();
        other.takeFromLeft(child);
        this.keys[i] = c[i].maxKey();
      }
    }
    const result = child.set(key, value, overwrite, tree);
    if (result === false) return false;
    this.keys[i] = child.maxKey();
    if (result === true) return true;
    if (this.keys.length < max2) {
      this.insert(i + 1, result);
      return true;
    } else {
      const newRightSibling = this.splitOffRightSide();
      let target = this;
      if (cmp(result.maxKey(), this.maxKey()) > 0) {
        target = newRightSibling;
        i -= this.keys.length;
      }
      target.insert(i + 1, result);
      return newRightSibling;
    }
  }
  /**
   * Inserts `child` at index `i`.
   * This does not mark `child` as shared, so it is the responsibility of the caller
   * to ensure that either child is marked shared, or it is not included in another tree.
   */
  insert(i, child) {
    this.children.splice(i, 0, child);
    this.keys.splice(i, 0, child.maxKey());
  }
  /**
   * Split this node.
   * Modifies this to remove the second half of the items, returning a separate node containing them.
   */
  splitOffRightSide() {
    const half = this.children.length >> 1;
    return new BNodeInternal(
      this.children.splice(half),
      this.keys.splice(half)
    );
  }
  takeFromRight(rhs) {
    this.keys.push(rhs.keys.shift());
    this.children.push(rhs.children.shift());
  }
  takeFromLeft(lhs) {
    this.keys.unshift(lhs.keys.pop());
    this.children.unshift(lhs.children.pop());
  }
  // ///////////////////////////////////////////////////////////////////////////
  // Internal Node: scanning & deletions //////////////////////////////////////
  // Note: `count` is the next value of the third argument to `onFound`.
  //       A leaf node's `forRange` function returns a new value for this counter,
  //       unless the operation is to stop early.
  forRange(low, high, includeHigh, editMode, tree, count2, onFound) {
    const cmp = tree._compare;
    const keys = this.keys, children = this.children;
    let iLow = this.indexOf(low, 0, cmp), i = iLow;
    const iHigh = Math.min(
      high === low ? iLow : this.indexOf(high, 0, cmp),
      keys.length - 1
    );
    if (!editMode) {
      for (; i <= iHigh; i++) {
        const result = children[i].forRange(
          low,
          high,
          includeHigh,
          editMode,
          tree,
          count2,
          onFound
        );
        if (typeof result !== `number`) return result;
        count2 = result;
      }
    } else if (i <= iHigh) {
      try {
        for (; i <= iHigh; i++) {
          if (children[i].isShared) children[i] = children[i].clone();
          const result = children[i].forRange(
            low,
            high,
            includeHigh,
            editMode,
            tree,
            count2,
            onFound
          );
          keys[i] = children[i].maxKey();
          if (typeof result !== `number`) return result;
          count2 = result;
        }
      } finally {
        const half = tree._maxNodeSize >> 1;
        if (iLow > 0) iLow--;
        for (i = iHigh; i >= iLow; i--) {
          if (children[i].keys.length <= half) {
            if (children[i].keys.length !== 0) {
              this.tryMerge(i, tree._maxNodeSize);
            } else {
              keys.splice(i, 1);
              children.splice(i, 1);
            }
          }
        }
        if (children.length !== 0 && children[0].keys.length === 0)
          check(false, `emptiness bug`);
      }
    }
    return count2;
  }
  /** Merges child i with child i+1 if their combined size is not too large */
  tryMerge(i, maxSize) {
    const children = this.children;
    if (i >= 0 && i + 1 < children.length) {
      if (children[i].keys.length + children[i + 1].keys.length <= maxSize) {
        if (children[i].isShared)
          children[i] = children[i].clone();
        children[i].mergeSibling(children[i + 1], maxSize);
        children.splice(i + 1, 1);
        this.keys.splice(i + 1, 1);
        this.keys[i] = children[i].maxKey();
        return true;
      }
    }
    return false;
  }
  /**
   * Move children from `rhs` into this.
   * `rhs` must be part of this tree, and be removed from it after this call
   * (otherwise isShared for its children could be incorrect).
   */
  mergeSibling(rhs, maxNodeSize) {
    const oldLength = this.keys.length;
    this.keys.push.apply(this.keys, rhs.keys);
    const rhsChildren = rhs.children;
    this.children.push.apply(this.children, rhsChildren);
    if (rhs.isShared && !this.isShared) {
      for (const child of rhsChildren) child.isShared = true;
    }
    this.tryMerge(oldLength - 1, maxNodeSize);
  }
}
const undefVals = [];
const Delete = { delete: true }, DeleteRange = () => Delete;
const EmptyLeaf = (function() {
  const n = new BNode();
  n.isShared = true;
  return n;
})();
const ReusedArray = [];
function check(fact, ...args) {
  {
    args.unshift(`B+ tree`);
    throw new Error(args.join(` `));
  }
}
function createSingleRowRefProxy() {
  const cache = /* @__PURE__ */ new Map();
  function createProxy(path) {
    const pathKey = path.join(`.`);
    if (cache.has(pathKey)) {
      return cache.get(pathKey);
    }
    const proxy = new Proxy({}, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true;
        if (prop === `__path`) return path;
        if (prop === `__type`) return void 0;
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
        const newPath = [...path, String(prop)];
        return createProxy(newPath);
      },
      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true;
        return Reflect.has(target, prop);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
    cache.set(pathKey, proxy);
    return proxy;
  }
  return createProxy([]);
}
function createRefProxy(aliases) {
  const cache = /* @__PURE__ */ new Map();
  let accessId = 0;
  function createProxy(path) {
    const pathKey = path.join(`.`);
    if (cache.has(pathKey)) {
      return cache.get(pathKey);
    }
    const proxy = new Proxy({}, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true;
        if (prop === `__path`) return path;
        if (prop === `__type`) return void 0;
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
        const newPath = [...path, String(prop)];
        return createProxy(newPath);
      },
      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true;
        return Reflect.has(target, prop);
      },
      ownKeys(target) {
        const id = ++accessId;
        const sentinelKey = `__SPREAD_SENTINEL__${path.join(`.`)}__${id}`;
        if (!Object.prototype.hasOwnProperty.call(target, sentinelKey)) {
          Object.defineProperty(target, sentinelKey, {
            enumerable: true,
            configurable: true,
            value: true
          });
        }
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
    cache.set(pathKey, proxy);
    return proxy;
  }
  const rootProxy = new Proxy({}, {
    get(target, prop, receiver) {
      if (prop === `__refProxy`) return true;
      if (prop === `__path`) return [];
      if (prop === `__type`) return void 0;
      if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
      const propStr = String(prop);
      if (aliases.includes(propStr)) {
        return createProxy([propStr]);
      }
      return void 0;
    },
    has(target, prop) {
      if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
        return true;
      if (typeof prop === `string` && aliases.includes(prop)) return true;
      return Reflect.has(target, prop);
    },
    ownKeys(_target) {
      return [...aliases, `__refProxy`, `__path`, `__type`];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
        return { enumerable: false, configurable: true };
      }
      if (typeof prop === `string` && aliases.includes(prop)) {
        return { enumerable: true, configurable: true };
      }
      return void 0;
    }
  });
  return rootProxy;
}
function createRefProxyWithSelected(aliases) {
  const baseProxy = createRefProxy(aliases);
  const cache = /* @__PURE__ */ new Map();
  function createSelectedProxy(path) {
    const pathKey = path.join(`.`);
    if (cache.has(pathKey)) {
      return cache.get(pathKey);
    }
    const proxy = new Proxy({}, {
      get(target, prop, receiver) {
        if (prop === `__refProxy`) return true;
        if (prop === `__path`) return [`$selected`, ...path];
        if (prop === `__type`) return void 0;
        if (typeof prop === `symbol`) return Reflect.get(target, prop, receiver);
        const newPath = [...path, String(prop)];
        return createSelectedProxy(newPath);
      },
      has(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`)
          return true;
        return Reflect.has(target, prop);
      },
      ownKeys(target) {
        return Reflect.ownKeys(target);
      },
      getOwnPropertyDescriptor(target, prop) {
        if (prop === `__refProxy` || prop === `__path` || prop === `__type`) {
          return { enumerable: false, configurable: true };
        }
        return Reflect.getOwnPropertyDescriptor(target, prop);
      }
    });
    cache.set(pathKey, proxy);
    return proxy;
  }
  const wrappedSelectedProxy = createSelectedProxy([]);
  return new Proxy(baseProxy, {
    get(target, prop, receiver) {
      if (prop === `$selected`) {
        return wrappedSelectedProxy;
      }
      return Reflect.get(target, prop, receiver);
    },
    has(target, prop) {
      if (prop === `$selected`) return true;
      return Reflect.has(target, prop);
    },
    ownKeys(target) {
      return [...Reflect.ownKeys(target), `$selected`];
    },
    getOwnPropertyDescriptor(target, prop) {
      if (prop === `$selected`) {
        return {
          enumerable: true,
          configurable: true,
          value: wrappedSelectedProxy
        };
      }
      return Reflect.getOwnPropertyDescriptor(target, prop);
    }
  });
}
function toExpression(value) {
  if (isRefProxy(value)) {
    return new PropRef(value.__path);
  }
  if (value && typeof value === `object` && `type` in value && (value.type === `func` || value.type === `ref` || value.type === `val` || value.type === `agg`)) {
    return value;
  }
  return new Value(value);
}
function isRefProxy(value) {
  return value && typeof value === `object` && value.__refProxy === true;
}
function eq(left, right) {
  return new Func(`eq`, [toExpression(left), toExpression(right)]);
}
function gt(left, right) {
  return new Func(`gt`, [toExpression(left), toExpression(right)]);
}
function gte(left, right) {
  return new Func(`gte`, [toExpression(left), toExpression(right)]);
}
function lt(left, right) {
  return new Func(`lt`, [toExpression(left), toExpression(right)]);
}
function and(left, right, ...rest) {
  const allArgs = [left, right, ...rest];
  return new Func(
    `and`,
    allArgs.map((arg) => toExpression(arg))
  );
}
function or(left, right, ...rest) {
  const allArgs = [left, right, ...rest];
  return new Func(
    `or`,
    allArgs.map((arg) => toExpression(arg))
  );
}
function inArray(value, array) {
  return new Func(`in`, [toExpression(value), toExpression(array)]);
}
class BaseIndex {
  constructor(id, expression, name, options) {
    this.lookupCount = 0;
    this.totalLookupTime = 0;
    this.lastUpdated = /* @__PURE__ */ new Date();
    this.id = id;
    this.expression = expression;
    this.compareOptions = DEFAULT_COMPARE_OPTIONS;
    this.name = name;
    this.initialize(options);
  }
  // Common methods
  supports(operation) {
    return this.supportedOperations.has(operation);
  }
  matchesField(fieldPath) {
    return this.expression.type === `ref` && this.expression.path.length === fieldPath.length && this.expression.path.every((part, i) => part === fieldPath[i]);
  }
  /**
   * Checks if the compare options match the index's compare options.
   * The direction is ignored because the index can be reversed if the direction is different.
   */
  matchesCompareOptions(compareOptions) {
    const thisCompareOptionsWithoutDirection = {
      ...this.compareOptions,
      direction: void 0
    };
    const compareOptionsWithoutDirection = {
      ...compareOptions,
      direction: void 0
    };
    return deepEquals(
      thisCompareOptionsWithoutDirection,
      compareOptionsWithoutDirection
    );
  }
  /**
   * Checks if the index matches the provided direction.
   */
  matchesDirection(direction) {
    return this.compareOptions.direction === direction;
  }
  getStats() {
    return {
      entryCount: this.keyCount,
      lookupCount: this.lookupCount,
      averageLookupTime: this.lookupCount > 0 ? this.totalLookupTime / this.lookupCount : 0,
      lastUpdated: this.lastUpdated
    };
  }
  evaluateIndexExpression(item) {
    const evaluator = compileSingleRowExpression(this.expression);
    return evaluator(item);
  }
  trackLookup(startTime) {
    const duration = performance.now() - startTime;
    this.lookupCount++;
    this.totalLookupTime += duration;
  }
  updateTimestamp() {
    this.lastUpdated = /* @__PURE__ */ new Date();
  }
}
class BTreeIndex extends BaseIndex {
  constructor(id, expression, name, options) {
    super(id, expression, name, options);
    this.supportedOperations = /* @__PURE__ */ new Set([
      `eq`,
      `gt`,
      `gte`,
      `lt`,
      `lte`,
      `in`
    ]);
    this.valueMap = /* @__PURE__ */ new Map();
    this.indexedKeys = /* @__PURE__ */ new Set();
    this.compareFn = defaultComparator;
    const baseCompareFn = options?.compareFn ?? defaultComparator;
    this.compareFn = (a, b) => baseCompareFn(denormalizeUndefined(a), denormalizeUndefined(b));
    if (options?.compareOptions) {
      this.compareOptions = options.compareOptions;
    }
    this.orderedEntries = new BTree(this.compareFn);
  }
  initialize(_options) {
  }
  /**
   * Adds a value to the index
   */
  add(key, item) {
    let indexedValue;
    try {
      indexedValue = this.evaluateIndexExpression(item);
    } catch (error) {
      throw new Error(
        `Failed to evaluate index expression for key ${key}: ${error}`
      );
    }
    const normalizedValue = normalizeForBTree(indexedValue);
    if (this.valueMap.has(normalizedValue)) {
      this.valueMap.get(normalizedValue).add(key);
    } else {
      const keySet = /* @__PURE__ */ new Set([key]);
      this.valueMap.set(normalizedValue, keySet);
      this.orderedEntries.set(normalizedValue, void 0);
    }
    this.indexedKeys.add(key);
    this.updateTimestamp();
  }
  /**
   * Removes a value from the index
   */
  remove(key, item) {
    let indexedValue;
    try {
      indexedValue = this.evaluateIndexExpression(item);
    } catch (error) {
      console.warn(
        `Failed to evaluate index expression for key ${key} during removal:`,
        error
      );
      return;
    }
    const normalizedValue = normalizeForBTree(indexedValue);
    if (this.valueMap.has(normalizedValue)) {
      const keySet = this.valueMap.get(normalizedValue);
      keySet.delete(key);
      if (keySet.size === 0) {
        this.valueMap.delete(normalizedValue);
        this.orderedEntries.delete(normalizedValue);
      }
    }
    this.indexedKeys.delete(key);
    this.updateTimestamp();
  }
  /**
   * Updates a value in the index
   */
  update(key, oldItem, newItem) {
    this.remove(key, oldItem);
    this.add(key, newItem);
  }
  /**
   * Builds the index from a collection of entries
   */
  build(entries) {
    this.clear();
    for (const [key, item] of entries) {
      this.add(key, item);
    }
  }
  /**
   * Clears all data from the index
   */
  clear() {
    this.orderedEntries.clear();
    this.valueMap.clear();
    this.indexedKeys.clear();
    this.updateTimestamp();
  }
  /**
   * Performs a lookup operation
   */
  lookup(operation, value) {
    const startTime = performance.now();
    let result;
    switch (operation) {
      case `eq`:
        result = this.equalityLookup(value);
        break;
      case `gt`:
        result = this.rangeQuery({ from: value, fromInclusive: false });
        break;
      case `gte`:
        result = this.rangeQuery({ from: value, fromInclusive: true });
        break;
      case `lt`:
        result = this.rangeQuery({ to: value, toInclusive: false });
        break;
      case `lte`:
        result = this.rangeQuery({ to: value, toInclusive: true });
        break;
      case `in`:
        result = this.inArrayLookup(value);
        break;
      default:
        throw new Error(`Operation ${operation} not supported by BTreeIndex`);
    }
    this.trackLookup(startTime);
    return result;
  }
  /**
   * Gets the number of indexed keys
   */
  get keyCount() {
    return this.indexedKeys.size;
  }
  // Public methods for backward compatibility (used by tests)
  /**
   * Performs an equality lookup
   */
  equalityLookup(value) {
    const normalizedValue = normalizeForBTree(value);
    return new Set(this.valueMap.get(normalizedValue) ?? []);
  }
  /**
   * Performs a range query with options
   * This is more efficient for compound queries like "WHERE a > 5 AND a < 10"
   */
  rangeQuery(options = {}) {
    const { from, to, fromInclusive = true, toInclusive = true } = options;
    const result = /* @__PURE__ */ new Set();
    const hasFrom = `from` in options;
    const hasTo = `to` in options;
    const fromKey = hasFrom ? normalizeForBTree(from) : this.orderedEntries.minKey();
    const toKey = hasTo ? normalizeForBTree(to) : this.orderedEntries.maxKey();
    this.orderedEntries.forRange(
      fromKey,
      toKey,
      toInclusive,
      (indexedValue, _) => {
        if (!fromInclusive && this.compareFn(indexedValue, from) === 0) {
          return;
        }
        const keys = this.valueMap.get(indexedValue);
        if (keys) {
          keys.forEach((key) => result.add(key));
        }
      }
    );
    return result;
  }
  /**
   * Performs a reversed range query
   */
  rangeQueryReversed(options = {}) {
    const { from, to, fromInclusive = true, toInclusive = true } = options;
    const hasFrom = `from` in options;
    const hasTo = `to` in options;
    return this.rangeQuery({
      from: hasTo ? to : this.orderedEntries.maxKey(),
      to: hasFrom ? from : this.orderedEntries.minKey(),
      fromInclusive: toInclusive,
      toInclusive: fromInclusive
    });
  }
  /**
   * Internal method for taking items from the index.
   * @param n - The number of items to return
   * @param nextPair - Function to get the next pair from the BTree
   * @param from - Already normalized! undefined means "start from beginning/end", sentinel means "start from the key undefined"
   * @param filterFn - Optional filter function
   * @param reversed - Whether to reverse the order of keys within each value
   */
  takeInternal(n, nextPair, from, filterFn, reversed = false) {
    const keysInResult = /* @__PURE__ */ new Set();
    const result = [];
    let pair;
    let key = from;
    while ((pair = nextPair(key)) !== void 0 && result.length < n) {
      key = pair[0];
      const keys = this.valueMap.get(key);
      if (keys && keys.size > 0) {
        const sorted = Array.from(keys).sort(compareKeys);
        if (reversed) sorted.reverse();
        for (const ks of sorted) {
          if (result.length >= n) break;
          if (!keysInResult.has(ks) && (filterFn?.(ks) ?? true)) {
            result.push(ks);
            keysInResult.add(ks);
          }
        }
      }
    }
    return result;
  }
  /**
   * Returns the next n items after the provided item.
   * @param n - The number of items to return
   * @param from - The item to start from (exclusive).
   * @returns The next n items after the provided key.
   */
  take(n, from, filterFn) {
    const nextPair = (k) => this.orderedEntries.nextHigherPair(k);
    const normalizedFrom = normalizeForBTree(from);
    return this.takeInternal(n, nextPair, normalizedFrom, filterFn);
  }
  /**
   * Returns the first n items from the beginning.
   * @param n - The number of items to return
   * @param filterFn - Optional filter function
   * @returns The first n items
   */
  takeFromStart(n, filterFn) {
    const nextPair = (k) => this.orderedEntries.nextHigherPair(k);
    return this.takeInternal(n, nextPair, void 0, filterFn);
  }
  /**
   * Returns the next n items **before** the provided item (in descending order).
   * @param n - The number of items to return
   * @param from - The item to start from (exclusive). Required.
   * @returns The next n items **before** the provided key.
   */
  takeReversed(n, from, filterFn) {
    const nextPair = (k) => this.orderedEntries.nextLowerPair(k);
    const normalizedFrom = normalizeForBTree(from);
    return this.takeInternal(n, nextPair, normalizedFrom, filterFn, true);
  }
  /**
   * Returns the last n items from the end.
   * @param n - The number of items to return
   * @param filterFn - Optional filter function
   * @returns The last n items
   */
  takeReversedFromEnd(n, filterFn) {
    const nextPair = (k) => this.orderedEntries.nextLowerPair(k);
    return this.takeInternal(n, nextPair, void 0, filterFn, true);
  }
  /**
   * Performs an IN array lookup
   */
  inArrayLookup(values) {
    const result = /* @__PURE__ */ new Set();
    for (const value of values) {
      const normalizedValue = normalizeForBTree(value);
      const keys = this.valueMap.get(normalizedValue);
      if (keys) {
        keys.forEach((key) => result.add(key));
      }
    }
    return result;
  }
  // Getter methods for testing compatibility
  get indexedKeysSet() {
    return this.indexedKeys;
  }
  get orderedEntriesArray() {
    return this.orderedEntries.keysArray().map((key) => [
      denormalizeUndefined(key),
      this.valueMap.get(key) ?? /* @__PURE__ */ new Set()
    ]);
  }
  get orderedEntriesArrayReversed() {
    return this.takeReversedFromEnd(this.orderedEntries.size).map((key) => [
      denormalizeUndefined(key),
      this.valueMap.get(key) ?? /* @__PURE__ */ new Set()
    ]);
  }
  get valueMapData() {
    const result = /* @__PURE__ */ new Map();
    for (const [key, value] of this.valueMap) {
      result.set(denormalizeUndefined(key), value);
    }
    return result;
  }
}
function shouldAutoIndex(collection) {
  if (collection.config.autoIndex !== `eager`) {
    return false;
  }
  return true;
}
function ensureIndexForField(fieldName, fieldPath, collection, compareOptions, compareFn) {
  if (!shouldAutoIndex(collection)) {
    return;
  }
  const compareOpts = compareOptions ?? {
    ...DEFAULT_COMPARE_OPTIONS,
    ...collection.compareOptions
  };
  const existingIndex = Array.from(collection.indexes.values()).find(
    (index) => index.matchesField(fieldPath) && index.matchesCompareOptions(compareOpts)
  );
  if (existingIndex) {
    return;
  }
  try {
    collection.createIndex(
      (row) => {
        let current = row;
        for (const part of fieldPath) {
          current = current[part];
        }
        return current;
      },
      {
        name: `auto:${fieldPath.join(`.`)}`,
        indexType: BTreeIndex,
        options: compareFn ? { compareFn, compareOptions: compareOpts } : {}
      }
    );
  } catch (error) {
    console.warn(
      `${collection.id ? `[${collection.id}] ` : ``}Failed to create auto-index for field path "${fieldPath.join(`.`)}":`,
      error
    );
  }
}
function ensureIndexForExpression(expression, collection) {
  if (!shouldAutoIndex(collection)) {
    return;
  }
  const indexableExpressions = extractIndexableExpressions(expression);
  for (const { fieldName, fieldPath } of indexableExpressions) {
    ensureIndexForField(fieldName, fieldPath, collection);
  }
}
function extractIndexableExpressions(expression) {
  const results = [];
  function extractFromExpression(expr) {
    if (expr.type !== `func`) {
      return;
    }
    const func = expr;
    if (func.name === `and`) {
      for (const arg of func.args) {
        extractFromExpression(arg);
      }
      return;
    }
    const supportedOperations = [`eq`, `gt`, `gte`, `lt`, `lte`, `in`];
    if (!supportedOperations.includes(func.name)) {
      return;
    }
    if (func.args.length < 1 || func.args[0].type !== `ref`) {
      return;
    }
    const fieldRef = func.args[0];
    const fieldPath = fieldRef.path;
    if (fieldPath.length === 0) {
      return;
    }
    const fieldName = fieldPath.join(`_`);
    results.push({ fieldName, fieldPath });
  }
  extractFromExpression(expression);
  return results;
}
const { sum, count: count$1, avg, min, max } = groupByOperators;
function validateAndCreateMapping(groupByClause, selectClause) {
  const selectToGroupByIndex = /* @__PURE__ */ new Map();
  const groupByExpressions = [...groupByClause];
  if (!selectClause) {
    return { selectToGroupByIndex, groupByExpressions };
  }
  for (const [alias, expr] of Object.entries(selectClause)) {
    if (expr.type === `agg` || containsAggregate(expr)) {
      continue;
    }
    const groupIndex = groupByExpressions.findIndex(
      (groupExpr) => expressionsEqual(expr, groupExpr)
    );
    if (groupIndex === -1) {
      throw new NonAggregateExpressionNotInGroupByError(alias);
    }
    selectToGroupByIndex.set(alias, groupIndex);
  }
  return { selectToGroupByIndex, groupByExpressions };
}
function processGroupBy(pipeline, groupByClause, havingClauses, selectClause, fnHavingClauses) {
  if (groupByClause.length === 0) {
    const aggregates2 = {};
    const wrappedAggExprs2 = {};
    const aggCounter2 = { value: 0 };
    if (selectClause) {
      for (const [alias, expr] of Object.entries(selectClause)) {
        if (expr.type === `agg`) {
          aggregates2[alias] = getAggregateFunction(expr);
        } else if (containsAggregate(expr)) {
          const { transformed, extracted } = extractAndReplaceAggregates(
            expr,
            aggCounter2
          );
          for (const [syntheticAlias, aggExpr] of Object.entries(extracted)) {
            aggregates2[syntheticAlias] = getAggregateFunction(aggExpr);
          }
          wrappedAggExprs2[alias] = compileExpression(transformed);
        }
      }
    }
    const keyExtractor2 = () => ({ __singleGroup: true });
    pipeline = pipeline.pipe(
      groupBy(keyExtractor2, aggregates2)
    );
    pipeline = pipeline.pipe(
      map(([, aggregatedRow]) => {
        const selectResults = aggregatedRow.$selected || {};
        const finalResults = { ...selectResults };
        if (selectClause) {
          for (const [alias, expr] of Object.entries(selectClause)) {
            if (expr.type === `agg`) {
              finalResults[alias] = aggregatedRow[alias];
            }
          }
          evaluateWrappedAggregates(
            finalResults,
            aggregatedRow,
            wrappedAggExprs2
          );
        }
        return [
          `single_group`,
          {
            ...aggregatedRow,
            $selected: finalResults
          }
        ];
      })
    );
    if (havingClauses && havingClauses.length > 0) {
      for (const havingClause of havingClauses) {
        const havingExpression = getHavingExpression(havingClause);
        const transformedHavingClause = replaceAggregatesByRefs(
          havingExpression,
          selectClause || {},
          `$selected`
        );
        const compiledHaving = compileExpression(transformedHavingClause);
        pipeline = pipeline.pipe(
          filter(([, row]) => {
            const namespacedRow = { $selected: row.$selected };
            return toBooleanPredicate(compiledHaving(namespacedRow));
          })
        );
      }
    }
    if (fnHavingClauses && fnHavingClauses.length > 0) {
      for (const fnHaving of fnHavingClauses) {
        pipeline = pipeline.pipe(
          filter(([, row]) => {
            const namespacedRow = { $selected: row.$selected };
            return toBooleanPredicate(fnHaving(namespacedRow));
          })
        );
      }
    }
    return pipeline;
  }
  const mapping = validateAndCreateMapping(groupByClause, selectClause);
  const compiledGroupByExpressions = groupByClause.map(
    (e) => compileExpression(e)
  );
  const keyExtractor = ([, row]) => {
    const namespacedRow = { ...row };
    delete namespacedRow.$selected;
    const key = {};
    for (let i = 0; i < groupByClause.length; i++) {
      const compiledExpr = compiledGroupByExpressions[i];
      const value = compiledExpr(namespacedRow);
      key[`__key_${i}`] = value;
    }
    return key;
  };
  const aggregates = {};
  const wrappedAggExprs = {};
  const aggCounter = { value: 0 };
  if (selectClause) {
    for (const [alias, expr] of Object.entries(selectClause)) {
      if (expr.type === `agg`) {
        aggregates[alias] = getAggregateFunction(expr);
      } else if (containsAggregate(expr)) {
        const { transformed, extracted } = extractAndReplaceAggregates(
          expr,
          aggCounter
        );
        for (const [syntheticAlias, aggExpr] of Object.entries(extracted)) {
          aggregates[syntheticAlias] = getAggregateFunction(aggExpr);
        }
        wrappedAggExprs[alias] = compileExpression(transformed);
      }
    }
  }
  pipeline = pipeline.pipe(groupBy(keyExtractor, aggregates));
  pipeline = pipeline.pipe(
    map(([, aggregatedRow]) => {
      const selectResults = aggregatedRow.$selected || {};
      const finalResults = {};
      if (selectClause) {
        for (const [alias, expr] of Object.entries(selectClause)) {
          if (expr.type === `agg`) {
            finalResults[alias] = aggregatedRow[alias];
          } else if (!wrappedAggExprs[alias]) {
            const groupIndex = mapping.selectToGroupByIndex.get(alias);
            if (groupIndex !== void 0) {
              finalResults[alias] = aggregatedRow[`__key_${groupIndex}`];
            } else {
              finalResults[alias] = selectResults[alias];
            }
          }
        }
        evaluateWrappedAggregates(
          finalResults,
          aggregatedRow,
          wrappedAggExprs
        );
      } else {
        for (let i = 0; i < groupByClause.length; i++) {
          finalResults[`__key_${i}`] = aggregatedRow[`__key_${i}`];
        }
      }
      let finalKey;
      if (groupByClause.length === 1) {
        finalKey = aggregatedRow[`__key_0`];
      } else {
        const keyParts = [];
        for (let i = 0; i < groupByClause.length; i++) {
          keyParts.push(aggregatedRow[`__key_${i}`]);
        }
        finalKey = serializeValue(keyParts);
      }
      return [
        finalKey,
        {
          ...aggregatedRow,
          $selected: finalResults
        }
      ];
    })
  );
  if (havingClauses && havingClauses.length > 0) {
    for (const havingClause of havingClauses) {
      const havingExpression = getHavingExpression(havingClause);
      const transformedHavingClause = replaceAggregatesByRefs(
        havingExpression,
        selectClause || {}
      );
      const compiledHaving = compileExpression(transformedHavingClause);
      pipeline = pipeline.pipe(
        filter(([, row]) => {
          const namespacedRow = { $selected: row.$selected };
          return compiledHaving(namespacedRow);
        })
      );
    }
  }
  if (fnHavingClauses && fnHavingClauses.length > 0) {
    for (const fnHaving of fnHavingClauses) {
      pipeline = pipeline.pipe(
        filter(([, row]) => {
          const namespacedRow = { $selected: row.$selected };
          return toBooleanPredicate(fnHaving(namespacedRow));
        })
      );
    }
  }
  return pipeline;
}
function expressionsEqual(expr1, expr2) {
  if (!expr1 || !expr2) return false;
  if (expr1.type !== expr2.type) return false;
  switch (expr1.type) {
    case `ref`:
      if (!expr1.path || !expr2.path) return false;
      if (expr1.path.length !== expr2.path.length) return false;
      return expr1.path.every(
        (segment, i) => segment === expr2.path[i]
      );
    case `val`:
      return expr1.value === expr2.value;
    case `func`:
      return expr1.name === expr2.name && expr1.args?.length === expr2.args?.length && (expr1.args || []).every(
        (arg, i) => expressionsEqual(arg, expr2.args[i])
      );
    case `agg`:
      return expr1.name === expr2.name && expr1.args?.length === expr2.args?.length && (expr1.args || []).every(
        (arg, i) => expressionsEqual(arg, expr2.args[i])
      );
    default:
      return false;
  }
}
function getAggregateFunction(aggExpr) {
  const compiledExpr = compileExpression(aggExpr.args[0]);
  const valueExtractor = ([, namespacedRow]) => {
    const value = compiledExpr(namespacedRow);
    if (typeof value === `number`) {
      return value;
    }
    return value != null ? Number(value) : 0;
  };
  const valueExtractorForMinMax = ([, namespacedRow]) => {
    const value = compiledExpr(namespacedRow);
    if (typeof value === `number` || typeof value === `string` || typeof value === `bigint` || value instanceof Date) {
      return value;
    }
    return value != null ? Number(value) : 0;
  };
  const rawValueExtractor = ([, namespacedRow]) => {
    return compiledExpr(namespacedRow);
  };
  switch (aggExpr.name.toLowerCase()) {
    case `sum`:
      return sum(valueExtractor);
    case `count`:
      return count$1(rawValueExtractor);
    case `avg`:
      return avg(valueExtractor);
    case `min`:
      return min(valueExtractorForMinMax);
    case `max`:
      return max(valueExtractorForMinMax);
    default:
      throw new UnsupportedAggregateFunctionError(aggExpr.name);
  }
}
function replaceAggregatesByRefs(havingExpr, selectClause, resultAlias = `$selected`) {
  switch (havingExpr.type) {
    case `agg`: {
      const aggExpr = havingExpr;
      for (const [alias, selectExpr] of Object.entries(selectClause)) {
        if (selectExpr.type === `agg` && aggregatesEqual(aggExpr, selectExpr)) {
          return new PropRef([resultAlias, alias]);
        }
      }
      throw new AggregateFunctionNotInSelectError(aggExpr.name);
    }
    case `func`: {
      const funcExpr = havingExpr;
      const transformedArgs = funcExpr.args.map(
        (arg) => replaceAggregatesByRefs(arg, selectClause)
      );
      return new Func(funcExpr.name, transformedArgs);
    }
    case `ref`:
      return havingExpr;
    case `val`:
      return havingExpr;
    default:
      throw new UnknownHavingExpressionTypeError(havingExpr.type);
  }
}
function evaluateWrappedAggregates(finalResults, aggregatedRow, wrappedAggExprs) {
  for (const key of Object.keys(aggregatedRow)) {
    if (key.startsWith(`__agg_`)) {
      finalResults[key] = aggregatedRow[key];
    }
  }
  for (const [alias, evaluator] of Object.entries(wrappedAggExprs)) {
    finalResults[alias] = evaluator({ $selected: finalResults });
  }
  for (const key of Object.keys(finalResults)) {
    if (key.startsWith(`__agg_`)) delete finalResults[key];
  }
}
function containsAggregate(expr) {
  if (!isExpressionLike(expr)) {
    return false;
  }
  if (expr.type === `agg`) {
    return true;
  }
  if (expr.type === `func`) {
    return expr.args.some(
      (arg) => containsAggregate(arg)
    );
  }
  return false;
}
function extractAndReplaceAggregates(expr, counter) {
  if (expr.type === `agg`) {
    const alias = `__agg_${counter.value++}`;
    return {
      transformed: new PropRef([`$selected`, alias]),
      extracted: { [alias]: expr }
    };
  }
  if (expr.type === `func`) {
    const allExtracted = {};
    const newArgs = expr.args.map((arg) => {
      const result = extractAndReplaceAggregates(arg, counter);
      Object.assign(allExtracted, result.extracted);
      return result.transformed;
    });
    return {
      transformed: new Func(expr.name, newArgs),
      extracted: allExtracted
    };
  }
  return { transformed: expr, extracted: {} };
}
function aggregatesEqual(agg1, agg2) {
  return agg1.name === agg2.name && agg1.args.length === agg2.args.length && agg1.args.every((arg, i) => expressionsEqual(arg, agg2.args[i]));
}
function processOrderBy(rawQuery, pipeline, orderByClause, selectClause, collection, optimizableOrderByCollections, setWindowFn, limit, offset) {
  const compiledOrderBy = orderByClause.map((clause) => {
    const clauseWithoutAggregates = replaceAggregatesByRefs(
      clause.expression,
      selectClause,
      `$selected`
    );
    return {
      compiledExpression: compileExpression(clauseWithoutAggregates),
      compareOptions: buildCompareOptions(clause, collection)
    };
  });
  const valueExtractor = (row) => {
    const orderByContext = row;
    if (orderByClause.length > 1) {
      return compiledOrderBy.map(
        (compiled) => compiled.compiledExpression(orderByContext)
      );
    } else if (orderByClause.length === 1) {
      const compiled = compiledOrderBy[0];
      return compiled.compiledExpression(orderByContext);
    }
    return null;
  };
  const compare = (a, b) => {
    if (orderByClause.length > 1) {
      const arrayA = a;
      const arrayB = b;
      for (let i = 0; i < orderByClause.length; i++) {
        const clause = compiledOrderBy[i];
        const compareFn = makeComparator(clause.compareOptions);
        const result = compareFn(arrayA[i], arrayB[i]);
        if (result !== 0) {
          return result;
        }
      }
      return arrayA.length - arrayB.length;
    }
    if (orderByClause.length === 1) {
      const clause = compiledOrderBy[0];
      const compareFn = makeComparator(clause.compareOptions);
      return compareFn(a, b);
    }
    return defaultComparator(a, b);
  };
  let setSizeCallback;
  let orderByOptimizationInfo;
  if (limit) {
    let index;
    let followRefCollection;
    let firstColumnValueExtractor;
    let orderByAlias = rawQuery.from.alias;
    const firstClause = orderByClause[0];
    const firstOrderByExpression = firstClause.expression;
    if (firstOrderByExpression.type === `ref`) {
      const followRefResult = followRef(
        rawQuery,
        firstOrderByExpression,
        collection
      );
      if (followRefResult) {
        followRefCollection = followRefResult.collection;
        const fieldName = followRefResult.path[0];
        const compareOpts = buildCompareOptions(
          firstClause,
          followRefCollection
        );
        if (fieldName) {
          ensureIndexForField(
            fieldName,
            followRefResult.path,
            followRefCollection,
            compareOpts,
            compare
          );
        }
        firstColumnValueExtractor = compileExpression(
          new PropRef(followRefResult.path),
          true
        );
        index = findIndexForField(
          followRefCollection,
          followRefResult.path,
          compareOpts
        );
        if (!index?.supports(`gt`)) {
          index = void 0;
        }
        orderByAlias = firstOrderByExpression.path.length > 1 ? String(firstOrderByExpression.path[0]) : rawQuery.from.alias;
      }
    }
    if (!firstColumnValueExtractor) ;
    else {
      const allColumnsAreRefs = orderByClause.every(
        (clause) => clause.expression.type === `ref`
      );
      const allColumnExtractors = allColumnsAreRefs ? orderByClause.map((clause) => {
        const refExpr = clause.expression;
        const followResult = followRef(rawQuery, refExpr, collection);
        if (followResult) {
          return compileExpression(
            new PropRef(followResult.path),
            true
          );
        }
        return compileExpression(
          clause.expression,
          true
        );
      }) : void 0;
      const comparator = (a, b) => {
        if (orderByClause.length === 1) {
          const extractedA = a ? firstColumnValueExtractor(a) : a;
          const extractedB = b ? firstColumnValueExtractor(b) : b;
          return compare(extractedA, extractedB);
        }
        if (allColumnExtractors) {
          const extractAll = (row) => {
            if (!row) return row;
            return allColumnExtractors.map((extractor) => extractor(row));
          };
          return compare(extractAll(a), extractAll(b));
        }
        return 0;
      };
      const rawRowValueExtractor = (row) => {
        if (orderByClause.length === 1) {
          return firstColumnValueExtractor(row);
        }
        if (allColumnExtractors) {
          return allColumnExtractors.map((extractor) => extractor(row));
        }
        return void 0;
      };
      orderByOptimizationInfo = {
        alias: orderByAlias,
        offset: offset ?? 0,
        limit,
        comparator,
        valueExtractorForRawRow: rawRowValueExtractor,
        firstColumnValueExtractor,
        index,
        orderBy: orderByClause
      };
      const targetCollectionId = followRefCollection?.id ?? collection.id;
      optimizableOrderByCollections[targetCollectionId] = orderByOptimizationInfo;
      if (index) {
        setSizeCallback = (getSize) => {
          optimizableOrderByCollections[targetCollectionId][`dataNeeded`] = () => {
            const size = getSize();
            return Math.max(0, orderByOptimizationInfo.limit - size);
          };
        };
      }
    }
  }
  return pipeline.pipe(
    orderByWithFractionalIndex(valueExtractor, {
      limit,
      offset,
      comparator: compare,
      setSizeCallback,
      setWindowFn: (windowFn) => {
        setWindowFn(
          // We wrap the move function such that we update the orderByOptimizationInfo
          // because that is used by the `dataNeeded` callback to determine if we need to load more data
          (options) => {
            windowFn(options);
            if (orderByOptimizationInfo) {
              orderByOptimizationInfo.offset = options.offset ?? orderByOptimizationInfo.offset;
              orderByOptimizationInfo.limit = options.limit ?? orderByOptimizationInfo.limit;
            }
          }
        );
      }
    })
    // orderByWithFractionalIndex returns [key, [value, index]] - we keep this format
  );
}
function buildCompareOptions(clause, collection) {
  if (clause.compareOptions.stringSort !== void 0) {
    return clause.compareOptions;
  }
  return {
    ...collection.compareOptions,
    direction: clause.compareOptions.direction,
    nulls: clause.compareOptions.nulls
  };
}
function currentStateAsChanges(collection, options = {}) {
  const collectFilteredResults = (filterFn) => {
    const result = [];
    for (const [key, value] of collection.entries()) {
      if (filterFn?.(value) ?? true) {
        result.push({
          type: `insert`,
          key,
          value
        });
      }
    }
    return result;
  };
  if (options.limit !== void 0 && !options.orderBy) {
    throw new Error(`limit cannot be used without orderBy`);
  }
  if (options.orderBy) {
    const whereFilter = options.where ? createFilterFunctionFromExpression(options.where) : void 0;
    const orderedKeys = getOrderedKeys(
      collection,
      options.orderBy,
      options.limit,
      whereFilter,
      options.optimizedOnly
    );
    if (orderedKeys === void 0) {
      return;
    }
    const result = [];
    for (const key of orderedKeys) {
      const value = collection.get(key);
      if (value !== void 0) {
        result.push({
          type: `insert`,
          key,
          value
        });
      }
    }
    return result;
  }
  if (!options.where) {
    return collectFilteredResults();
  }
  try {
    const expression = options.where;
    const optimizationResult = optimizeExpressionWithIndexes(
      expression,
      collection
    );
    if (optimizationResult.canOptimize) {
      const result = [];
      for (const key of optimizationResult.matchingKeys) {
        const value = collection.get(key);
        if (value !== void 0) {
          result.push({
            type: `insert`,
            key,
            value
          });
        }
      }
      return result;
    } else {
      if (options.optimizedOnly) {
        return;
      }
      const filterFn = createFilterFunctionFromExpression(expression);
      return collectFilteredResults(filterFn);
    }
  } catch (error) {
    console.warn(
      `${collection.id ? `[${collection.id}] ` : ``}Error processing where clause, falling back to full scan:`,
      error
    );
    const filterFn = createFilterFunctionFromExpression(options.where);
    if (options.optimizedOnly) {
      return;
    }
    return collectFilteredResults(filterFn);
  }
}
function createFilterFunctionFromExpression(expression) {
  const evaluator = compileSingleRowExpression(expression);
  return (item) => {
    try {
      const result = evaluator(item);
      return toBooleanPredicate(result);
    } catch {
      return false;
    }
  };
}
function createFilteredCallback(originalCallback, options) {
  const filterFn = createFilterFunctionFromExpression(options.whereExpression);
  return (changes) => {
    const filteredChanges = [];
    for (const change of changes) {
      if (change.type === `insert`) {
        if (filterFn(change.value)) {
          filteredChanges.push(change);
        }
      } else if (change.type === `update`) {
        const newValueMatches = filterFn(change.value);
        const oldValueMatches = change.previousValue ? filterFn(change.previousValue) : false;
        if (newValueMatches && oldValueMatches) {
          filteredChanges.push(change);
        } else if (newValueMatches && !oldValueMatches) {
          filteredChanges.push({
            ...change,
            type: `insert`
          });
        } else if (!newValueMatches && oldValueMatches) {
          filteredChanges.push({
            ...change,
            type: `delete`,
            value: change.previousValue
            // Use the previous value for the delete
          });
        }
      } else {
        if (filterFn(change.value)) {
          filteredChanges.push(change);
        }
      }
    }
    if (filteredChanges.length > 0 || changes.length === 0) {
      originalCallback(filteredChanges);
    }
  };
}
function getOrderedKeys(collection, orderBy, limit, whereFilter, optimizedOnly) {
  if (orderBy.length === 1) {
    const clause = orderBy[0];
    const orderByExpression = clause.expression;
    if (orderByExpression.type === `ref`) {
      const propRef = orderByExpression;
      const fieldPath = propRef.path;
      const compareOpts = buildCompareOptions(clause, collection);
      ensureIndexForField(
        fieldPath[0],
        fieldPath,
        collection,
        compareOpts
      );
      const index = findIndexForField(collection, fieldPath, compareOpts);
      if (index && index.supports(`gt`)) {
        const filterFn = (key) => {
          const value = collection.get(key);
          if (value === void 0) {
            return false;
          }
          return whereFilter?.(value) ?? true;
        };
        return index.takeFromStart(limit ?? index.keyCount, filterFn);
      }
    }
  }
  if (optimizedOnly) {
    return;
  }
  const allItems = [];
  for (const [key, value] of collection.entries()) {
    if (whereFilter?.(value) ?? true) {
      allItems.push({ key, value });
    }
  }
  const compare = (a, b) => {
    for (const clause of orderBy) {
      const compareFn = makeComparator(clause.compareOptions);
      const aValue = extractValueFromItem(a.value, clause.expression);
      const bValue = extractValueFromItem(b.value, clause.expression);
      const result = compareFn(aValue, bValue);
      if (result !== 0) {
        return result;
      }
    }
    return 0;
  };
  allItems.sort(compare);
  const sortedKeys = allItems.map((item) => item.key);
  if (limit !== void 0) {
    return sortedKeys.slice(0, limit);
  }
  return sortedKeys;
}
function extractValueFromItem(item, expression) {
  if (expression.type === `ref`) {
    const propRef = expression;
    let value = item;
    for (const pathPart of propRef.path) {
      value = value?.[pathPart];
    }
    return value;
  } else if (expression.type === `val`) {
    return expression.value;
  } else {
    const evaluator = compileSingleRowExpression(expression);
    return evaluator(item);
  }
}
class SortedMap {
  /**
   * Creates a new SortedMap instance
   *
   * @param comparator - Optional function to compare values for sorting.
   *                     If not provided, entries are sorted by key only.
   */
  constructor(comparator) {
    this.map = /* @__PURE__ */ new Map();
    this.sortedKeys = [];
    this.comparator = comparator;
  }
  /**
   * Finds the index where a key-value pair should be inserted to maintain sort order.
   * Uses binary search to find the correct position based on the value (if comparator provided),
   * with key-based tie-breaking for deterministic ordering when values compare as equal.
   * If no comparator is provided, sorts by key only.
   * Runs in O(log n) time.
   *
   * @param key - The key to find position for (used as tie-breaker or primary sort when no comparator)
   * @param value - The value to compare against (only used if comparator is provided)
   * @returns The index where the key should be inserted
   */
  indexOf(key, value) {
    let left = 0;
    let right = this.sortedKeys.length;
    if (!this.comparator) {
      while (left < right) {
        const mid = Math.floor((left + right) / 2);
        const midKey = this.sortedKeys[mid];
        const keyComparison = compareKeys(key, midKey);
        if (keyComparison < 0) {
          right = mid;
        } else if (keyComparison > 0) {
          left = mid + 1;
        } else {
          return mid;
        }
      }
      return left;
    }
    while (left < right) {
      const mid = Math.floor((left + right) / 2);
      const midKey = this.sortedKeys[mid];
      const midValue = this.map.get(midKey);
      const valueComparison = this.comparator(value, midValue);
      if (valueComparison < 0) {
        right = mid;
      } else if (valueComparison > 0) {
        left = mid + 1;
      } else {
        const keyComparison = compareKeys(key, midKey);
        if (keyComparison < 0) {
          right = mid;
        } else if (keyComparison > 0) {
          left = mid + 1;
        } else {
          return mid;
        }
      }
    }
    return left;
  }
  /**
   * Sets a key-value pair in the map and maintains sort order
   *
   * @param key - The key to set
   * @param value - The value to associate with the key
   * @returns This SortedMap instance for chaining
   */
  set(key, value) {
    if (this.map.has(key)) {
      const oldValue = this.map.get(key);
      const oldIndex = this.indexOf(key, oldValue);
      this.sortedKeys.splice(oldIndex, 1);
    }
    const index = this.indexOf(key, value);
    this.sortedKeys.splice(index, 0, key);
    this.map.set(key, value);
    return this;
  }
  /**
   * Gets a value by its key
   *
   * @param key - The key to look up
   * @returns The value associated with the key, or undefined if not found
   */
  get(key) {
    return this.map.get(key);
  }
  /**
   * Removes a key-value pair from the map
   *
   * @param key - The key to remove
   * @returns True if the key was found and removed, false otherwise
   */
  delete(key) {
    if (this.map.has(key)) {
      const oldValue = this.map.get(key);
      const index = this.indexOf(key, oldValue);
      this.sortedKeys.splice(index, 1);
      return this.map.delete(key);
    }
    return false;
  }
  /**
   * Checks if a key exists in the map
   *
   * @param key - The key to check
   * @returns True if the key exists, false otherwise
   */
  has(key) {
    return this.map.has(key);
  }
  /**
   * Removes all key-value pairs from the map
   */
  clear() {
    this.map.clear();
    this.sortedKeys = [];
  }
  /**
   * Gets the number of key-value pairs in the map
   */
  get size() {
    return this.map.size;
  }
  /**
   * Default iterator that returns entries in sorted order
   *
   * @returns An iterator for the map's entries
   */
  *[Symbol.iterator]() {
    for (const key of this.sortedKeys) {
      yield [key, this.map.get(key)];
    }
  }
  /**
   * Returns an iterator for the map's entries in sorted order
   *
   * @returns An iterator for the map's entries
   */
  entries() {
    return this[Symbol.iterator]();
  }
  /**
   * Returns an iterator for the map's keys in sorted order
   *
   * @returns An iterator for the map's keys
   */
  keys() {
    return this.sortedKeys[Symbol.iterator]();
  }
  /**
   * Returns an iterator for the map's values in sorted order
   *
   * @returns An iterator for the map's values
   */
  values() {
    return (function* () {
      for (const key of this.sortedKeys) {
        yield this.map.get(key);
      }
    }).call(this);
  }
  /**
   * Executes a callback function for each key-value pair in the map in sorted order
   *
   * @param callbackfn - Function to execute for each entry
   */
  forEach(callbackfn) {
    for (const key of this.sortedKeys) {
      callbackfn(this.map.get(key), key, this.map);
    }
  }
}
class CollectionStateManager {
  /**
   * Creates a new CollectionState manager
   */
  constructor(config) {
    this.pendingSyncedTransactions = [];
    this.syncedMetadata = /* @__PURE__ */ new Map();
    this.optimisticUpserts = /* @__PURE__ */ new Map();
    this.optimisticDeletes = /* @__PURE__ */ new Set();
    this.size = 0;
    this.syncedKeys = /* @__PURE__ */ new Set();
    this.preSyncVisibleState = /* @__PURE__ */ new Map();
    this.recentlySyncedKeys = /* @__PURE__ */ new Set();
    this.hasReceivedFirstCommit = false;
    this.isCommittingSyncTransactions = false;
    this.commitPendingTransactions = () => {
      let hasPersistingTransaction = false;
      for (const transaction of this.transactions.values()) {
        if (transaction.state === `persisting`) {
          hasPersistingTransaction = true;
          break;
        }
      }
      const {
        committedSyncedTransactions,
        uncommittedSyncedTransactions,
        hasTruncateSync,
        hasImmediateSync
      } = this.pendingSyncedTransactions.reduce(
        (acc, t) => {
          if (t.committed) {
            acc.committedSyncedTransactions.push(t);
            if (t.truncate) {
              acc.hasTruncateSync = true;
            }
            if (t.immediate) {
              acc.hasImmediateSync = true;
            }
          } else {
            acc.uncommittedSyncedTransactions.push(t);
          }
          return acc;
        },
        {
          committedSyncedTransactions: [],
          uncommittedSyncedTransactions: [],
          hasTruncateSync: false,
          hasImmediateSync: false
        }
      );
      if (!hasPersistingTransaction || hasTruncateSync || hasImmediateSync) {
        this.isCommittingSyncTransactions = true;
        const truncateOptimisticSnapshot = hasTruncateSync ? committedSyncedTransactions.find((t) => t.truncate)?.optimisticSnapshot : null;
        const changedKeys = /* @__PURE__ */ new Set();
        for (const transaction of committedSyncedTransactions) {
          for (const operation of transaction.operations) {
            changedKeys.add(operation.key);
          }
        }
        let currentVisibleState = this.preSyncVisibleState;
        if (currentVisibleState.size === 0) {
          currentVisibleState = /* @__PURE__ */ new Map();
          for (const key of changedKeys) {
            const currentValue = this.get(key);
            if (currentValue !== void 0) {
              currentVisibleState.set(key, currentValue);
            }
          }
        }
        const events = [];
        const rowUpdateMode = this.config.sync.rowUpdateMode || `partial`;
        for (const transaction of committedSyncedTransactions) {
          if (transaction.truncate) {
            const visibleKeys = /* @__PURE__ */ new Set([
              ...this.syncedData.keys(),
              ...truncateOptimisticSnapshot?.upserts.keys() || []
            ]);
            for (const key of visibleKeys) {
              if (truncateOptimisticSnapshot?.deletes.has(key)) continue;
              const previousValue = truncateOptimisticSnapshot?.upserts.get(key) || this.syncedData.get(key);
              if (previousValue !== void 0) {
                events.push({ type: `delete`, key, value: previousValue });
              }
            }
            this.syncedData.clear();
            this.syncedMetadata.clear();
            this.syncedKeys.clear();
            for (const key of changedKeys) {
              currentVisibleState.delete(key);
            }
            this._events.emit(`truncate`, {
              type: `truncate`,
              collection: this.collection
            });
          }
          for (const operation of transaction.operations) {
            const key = operation.key;
            this.syncedKeys.add(key);
            switch (operation.type) {
              case `insert`:
                this.syncedMetadata.set(key, operation.metadata);
                break;
              case `update`:
                this.syncedMetadata.set(
                  key,
                  Object.assign(
                    {},
                    this.syncedMetadata.get(key),
                    operation.metadata
                  )
                );
                break;
              case `delete`:
                this.syncedMetadata.delete(key);
                break;
            }
            switch (operation.type) {
              case `insert`:
                this.syncedData.set(key, operation.value);
                break;
              case `update`: {
                if (rowUpdateMode === `partial`) {
                  const updatedValue = Object.assign(
                    {},
                    this.syncedData.get(key),
                    operation.value
                  );
                  this.syncedData.set(key, updatedValue);
                } else {
                  this.syncedData.set(key, operation.value);
                }
                break;
              }
              case `delete`:
                this.syncedData.delete(key);
                break;
            }
          }
        }
        if (hasTruncateSync) {
          const syncedInsertedOrUpdatedKeys = /* @__PURE__ */ new Set();
          for (const t of committedSyncedTransactions) {
            for (const op of t.operations) {
              if (op.type === `insert` || op.type === `update`) {
                syncedInsertedOrUpdatedKeys.add(op.key);
              }
            }
          }
          const reapplyUpserts = new Map(
            truncateOptimisticSnapshot.upserts
          );
          const reapplyDeletes = new Set(
            truncateOptimisticSnapshot.deletes
          );
          for (const [key, value] of reapplyUpserts) {
            if (reapplyDeletes.has(key)) continue;
            if (syncedInsertedOrUpdatedKeys.has(key)) {
              let foundInsert = false;
              for (let i = events.length - 1; i >= 0; i--) {
                const evt = events[i];
                if (evt.key === key && evt.type === `insert`) {
                  evt.value = value;
                  foundInsert = true;
                  break;
                }
              }
              if (!foundInsert) {
                events.push({ type: `insert`, key, value });
              }
            } else {
              events.push({ type: `insert`, key, value });
            }
          }
          if (events.length > 0 && reapplyDeletes.size > 0) {
            const filtered = [];
            for (const evt of events) {
              if (evt.type === `insert` && reapplyDeletes.has(evt.key)) {
                continue;
              }
              filtered.push(evt);
            }
            events.length = 0;
            events.push(...filtered);
          }
          if (this.lifecycle.status !== `ready`) {
            this.lifecycle.markReady();
          }
        }
        this.optimisticUpserts.clear();
        this.optimisticDeletes.clear();
        this.isCommittingSyncTransactions = false;
        if (hasTruncateSync && truncateOptimisticSnapshot) {
          for (const [key, value] of truncateOptimisticSnapshot.upserts) {
            this.optimisticUpserts.set(key, value);
          }
          for (const key of truncateOptimisticSnapshot.deletes) {
            this.optimisticDeletes.add(key);
          }
        }
        for (const transaction of this.transactions.values()) {
          if (![`completed`, `failed`].includes(transaction.state)) {
            for (const mutation of transaction.mutations) {
              if (this.isThisCollection(mutation.collection) && mutation.optimistic) {
                switch (mutation.type) {
                  case `insert`:
                  case `update`:
                    this.optimisticUpserts.set(
                      mutation.key,
                      mutation.modified
                    );
                    this.optimisticDeletes.delete(mutation.key);
                    break;
                  case `delete`:
                    this.optimisticUpserts.delete(mutation.key);
                    this.optimisticDeletes.add(mutation.key);
                    break;
                }
              }
            }
          }
        }
        const completedOptimisticOps = /* @__PURE__ */ new Map();
        for (const transaction of this.transactions.values()) {
          if (transaction.state === `completed`) {
            for (const mutation of transaction.mutations) {
              if (mutation.optimistic && this.isThisCollection(mutation.collection) && changedKeys.has(mutation.key)) {
                completedOptimisticOps.set(mutation.key, {
                  type: mutation.type,
                  value: mutation.modified
                });
              }
            }
          }
        }
        for (const key of changedKeys) {
          const previousVisibleValue = currentVisibleState.get(key);
          const newVisibleValue = this.get(key);
          const completedOp = completedOptimisticOps.get(key);
          let isRedundantSync = false;
          if (completedOp) {
            if (completedOp.type === `delete` && previousVisibleValue !== void 0 && newVisibleValue === void 0 && deepEquals(completedOp.value, previousVisibleValue)) {
              isRedundantSync = true;
            } else if (newVisibleValue !== void 0 && deepEquals(completedOp.value, newVisibleValue)) {
              isRedundantSync = true;
            }
          }
          if (!isRedundantSync) {
            if (previousVisibleValue === void 0 && newVisibleValue !== void 0) {
              events.push({
                type: `insert`,
                key,
                value: newVisibleValue
              });
            } else if (previousVisibleValue !== void 0 && newVisibleValue === void 0) {
              events.push({
                type: `delete`,
                key,
                value: previousVisibleValue
              });
            } else if (previousVisibleValue !== void 0 && newVisibleValue !== void 0 && !deepEquals(previousVisibleValue, newVisibleValue)) {
              events.push({
                type: `update`,
                key,
                value: newVisibleValue,
                previousValue: previousVisibleValue
              });
            }
          }
        }
        this.size = this.calculateSize();
        if (events.length > 0) {
          this.indexes.updateIndexes(events);
        }
        this.changes.emitEvents(events, true);
        this.pendingSyncedTransactions = uncommittedSyncedTransactions;
        this.preSyncVisibleState.clear();
        Promise.resolve().then(() => {
          this.recentlySyncedKeys.clear();
        });
        if (!this.hasReceivedFirstCommit) {
          this.hasReceivedFirstCommit = true;
        }
      }
    };
    this.config = config;
    this.transactions = new SortedMap(
      (a, b) => a.compareCreatedAt(b)
    );
    this.syncedData = new SortedMap(config.compare);
  }
  setDeps(deps) {
    this.collection = deps.collection;
    this.lifecycle = deps.lifecycle;
    this.changes = deps.changes;
    this.indexes = deps.indexes;
    this._events = deps.events;
  }
  /**
   * Get the current value for a key (virtual derived state)
   */
  get(key) {
    const { optimisticDeletes, optimisticUpserts, syncedData } = this;
    if (optimisticDeletes.has(key)) {
      return void 0;
    }
    if (optimisticUpserts.has(key)) {
      return optimisticUpserts.get(key);
    }
    return syncedData.get(key);
  }
  /**
   * Check if a key exists in the collection (virtual derived state)
   */
  has(key) {
    const { optimisticDeletes, optimisticUpserts, syncedData } = this;
    if (optimisticDeletes.has(key)) {
      return false;
    }
    if (optimisticUpserts.has(key)) {
      return true;
    }
    return syncedData.has(key);
  }
  /**
   * Get all keys (virtual derived state)
   */
  *keys() {
    const { syncedData, optimisticDeletes, optimisticUpserts } = this;
    for (const key of syncedData.keys()) {
      if (!optimisticDeletes.has(key)) {
        yield key;
      }
    }
    for (const key of optimisticUpserts.keys()) {
      if (!syncedData.has(key) && !optimisticDeletes.has(key)) {
        yield key;
      }
    }
  }
  /**
   * Get all values (virtual derived state)
   */
  *values() {
    for (const key of this.keys()) {
      const value = this.get(key);
      if (value !== void 0) {
        yield value;
      }
    }
  }
  /**
   * Get all entries (virtual derived state)
   */
  *entries() {
    for (const key of this.keys()) {
      const value = this.get(key);
      if (value !== void 0) {
        yield [key, value];
      }
    }
  }
  /**
   * Get all entries (virtual derived state)
   */
  *[Symbol.iterator]() {
    for (const [key, value] of this.entries()) {
      yield [key, value];
    }
  }
  /**
   * Execute a callback for each entry in the collection
   */
  forEach(callbackfn) {
    let index = 0;
    for (const [key, value] of this.entries()) {
      callbackfn(value, key, index++);
    }
  }
  /**
   * Create a new array with the results of calling a function for each entry in the collection
   */
  map(callbackfn) {
    const result = [];
    let index = 0;
    for (const [key, value] of this.entries()) {
      result.push(callbackfn(value, key, index++));
    }
    return result;
  }
  /**
   * Check if the given collection is this collection
   * @param collection The collection to check
   * @returns True if the given collection is this collection, false otherwise
   */
  isThisCollection(collection) {
    return collection === this.collection;
  }
  /**
   * Recompute optimistic state from active transactions
   */
  recomputeOptimisticState(triggeredByUserAction = false) {
    if (this.isCommittingSyncTransactions && !triggeredByUserAction) {
      return;
    }
    const previousState = new Map(this.optimisticUpserts);
    const previousDeletes = new Set(this.optimisticDeletes);
    this.optimisticUpserts.clear();
    this.optimisticDeletes.clear();
    const activeTransactions = [];
    for (const transaction of this.transactions.values()) {
      if (![`completed`, `failed`].includes(transaction.state)) {
        activeTransactions.push(transaction);
      }
    }
    for (const transaction of activeTransactions) {
      for (const mutation of transaction.mutations) {
        if (this.isThisCollection(mutation.collection) && mutation.optimistic) {
          switch (mutation.type) {
            case `insert`:
            case `update`:
              this.optimisticUpserts.set(
                mutation.key,
                mutation.modified
              );
              this.optimisticDeletes.delete(mutation.key);
              break;
            case `delete`:
              this.optimisticUpserts.delete(mutation.key);
              this.optimisticDeletes.add(mutation.key);
              break;
          }
        }
      }
    }
    this.size = this.calculateSize();
    const events = [];
    this.collectOptimisticChanges(previousState, previousDeletes, events);
    const filteredEventsBySyncStatus = events.filter((event) => {
      if (!this.recentlySyncedKeys.has(event.key)) {
        return true;
      }
      if (triggeredByUserAction) {
        return true;
      }
      return false;
    });
    if (this.pendingSyncedTransactions.length > 0 && !triggeredByUserAction) {
      const pendingSyncKeys = /* @__PURE__ */ new Set();
      for (const transaction of this.pendingSyncedTransactions) {
        for (const operation of transaction.operations) {
          pendingSyncKeys.add(operation.key);
        }
      }
      const filteredEvents = filteredEventsBySyncStatus.filter((event) => {
        if (event.type === `delete` && pendingSyncKeys.has(event.key)) {
          const hasActiveOptimisticMutation = activeTransactions.some(
            (tx) => tx.mutations.some(
              (m) => this.isThisCollection(m.collection) && m.key === event.key
            )
          );
          if (!hasActiveOptimisticMutation) {
            return false;
          }
        }
        return true;
      });
      if (filteredEvents.length > 0) {
        this.indexes.updateIndexes(filteredEvents);
      }
      this.changes.emitEvents(filteredEvents, triggeredByUserAction);
    } else {
      if (filteredEventsBySyncStatus.length > 0) {
        this.indexes.updateIndexes(filteredEventsBySyncStatus);
      }
      this.changes.emitEvents(filteredEventsBySyncStatus, triggeredByUserAction);
    }
  }
  /**
   * Calculate the current size based on synced data and optimistic changes
   */
  calculateSize() {
    const syncedSize = this.syncedData.size;
    const deletesFromSynced = Array.from(this.optimisticDeletes).filter(
      (key) => this.syncedData.has(key) && !this.optimisticUpserts.has(key)
    ).length;
    const upsertsNotInSynced = Array.from(this.optimisticUpserts.keys()).filter(
      (key) => !this.syncedData.has(key)
    ).length;
    return syncedSize - deletesFromSynced + upsertsNotInSynced;
  }
  /**
   * Collect events for optimistic changes
   */
  collectOptimisticChanges(previousUpserts, previousDeletes, events) {
    const allKeys = /* @__PURE__ */ new Set([
      ...previousUpserts.keys(),
      ...this.optimisticUpserts.keys(),
      ...previousDeletes,
      ...this.optimisticDeletes
    ]);
    for (const key of allKeys) {
      const currentValue = this.get(key);
      const previousValue = this.getPreviousValue(
        key,
        previousUpserts,
        previousDeletes
      );
      if (previousValue !== void 0 && currentValue === void 0) {
        events.push({ type: `delete`, key, value: previousValue });
      } else if (previousValue === void 0 && currentValue !== void 0) {
        events.push({ type: `insert`, key, value: currentValue });
      } else if (previousValue !== void 0 && currentValue !== void 0 && previousValue !== currentValue) {
        events.push({
          type: `update`,
          key,
          value: currentValue,
          previousValue
        });
      }
    }
  }
  /**
   * Get the previous value for a key given previous optimistic state
   */
  getPreviousValue(key, previousUpserts, previousDeletes) {
    if (previousDeletes.has(key)) {
      return void 0;
    }
    if (previousUpserts.has(key)) {
      return previousUpserts.get(key);
    }
    return this.syncedData.get(key);
  }
  /**
   * Schedule cleanup of a transaction when it completes
   */
  scheduleTransactionCleanup(transaction) {
    if (transaction.state === `completed`) {
      this.transactions.delete(transaction.id);
      return;
    }
    transaction.isPersisted.promise.then(() => {
      this.transactions.delete(transaction.id);
    }).catch(() => {
    });
  }
  /**
   * Capture visible state for keys that will be affected by pending sync operations
   * This must be called BEFORE onTransactionStateChange clears optimistic state
   */
  capturePreSyncVisibleState() {
    if (this.pendingSyncedTransactions.length === 0) return;
    const syncedKeys = /* @__PURE__ */ new Set();
    for (const transaction of this.pendingSyncedTransactions) {
      for (const operation of transaction.operations) {
        syncedKeys.add(operation.key);
      }
    }
    for (const key of syncedKeys) {
      this.recentlySyncedKeys.add(key);
    }
    for (const key of syncedKeys) {
      if (!this.preSyncVisibleState.has(key)) {
        const currentValue = this.get(key);
        if (currentValue !== void 0) {
          this.preSyncVisibleState.set(key, currentValue);
        }
      }
    }
  }
  /**
   * Trigger a recomputation when transactions change
   * This method should be called by the Transaction class when state changes
   */
  onTransactionStateChange() {
    this.changes.shouldBatchEvents = this.pendingSyncedTransactions.length > 0;
    this.capturePreSyncVisibleState();
    this.recomputeOptimisticState(false);
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  cleanup() {
    this.syncedData.clear();
    this.syncedMetadata.clear();
    this.optimisticUpserts.clear();
    this.optimisticDeletes.clear();
    this.size = 0;
    this.pendingSyncedTransactions = [];
    this.syncedKeys.clear();
    this.hasReceivedFirstCommit = false;
  }
}
class EventEmitter {
  constructor() {
    this.listeners = /* @__PURE__ */ new Map();
  }
  /**
   * Subscribe to an event
   * @param event - Event name to listen for
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, /* @__PURE__ */ new Set());
    }
    this.listeners.get(event).add(callback);
    return () => {
      this.listeners.get(event)?.delete(callback);
    };
  }
  /**
   * Subscribe to an event once (automatically unsubscribes after first emission)
   * @param event - Event name to listen for
   * @param callback - Function to call when event is emitted
   * @returns Unsubscribe function
   */
  once(event, callback) {
    const unsubscribe = this.on(event, (eventPayload) => {
      callback(eventPayload);
      unsubscribe();
    });
    return unsubscribe;
  }
  /**
   * Unsubscribe from an event
   * @param event - Event name to stop listening for
   * @param callback - Function to remove
   */
  off(event, callback) {
    this.listeners.get(event)?.delete(callback);
  }
  /**
   * Wait for an event to be emitted
   * @param event - Event name to wait for
   * @param timeout - Optional timeout in milliseconds
   * @returns Promise that resolves with the event payload
   */
  waitFor(event, timeout) {
    return new Promise((resolve, reject) => {
      let timeoutId;
      const unsubscribe = this.on(event, (eventPayload) => {
        if (timeoutId) {
          clearTimeout(timeoutId);
          timeoutId = void 0;
        }
        resolve(eventPayload);
        unsubscribe();
      });
      if (timeout) {
        timeoutId = setTimeout(() => {
          timeoutId = void 0;
          unsubscribe();
          reject(new Error(`Timeout waiting for event ${String(event)}`));
        }, timeout);
      }
    });
  }
  /**
   * Emit an event to all listeners
   * @param event - Event name to emit
   * @param eventPayload - Event payload
   * @internal For use by subclasses - subclasses should wrap this with a public emit if needed
   */
  emitInner(event, eventPayload) {
    this.listeners.get(event)?.forEach((listener) => {
      try {
        listener(eventPayload);
      } catch (error) {
        queueMicrotask(() => {
          throw error;
        });
      }
    });
  }
  /**
   * Clear all listeners
   */
  clearListeners() {
    this.listeners.clear();
  }
}
function buildCursor(orderBy, values) {
  if (values.length === 0 || orderBy.length === 0) {
    return void 0;
  }
  if (orderBy.length === 1) {
    const { expression, compareOptions } = orderBy[0];
    const operator = compareOptions.direction === `asc` ? gt : lt;
    return operator(expression, new Value(values[0]));
  }
  const clauses = [];
  for (let i = 0; i < orderBy.length && i < values.length; i++) {
    const clause = orderBy[i];
    const value = values[i];
    const eqConditions = [];
    for (let j = 0; j < i; j++) {
      const prevClause = orderBy[j];
      const prevValue = values[j];
      eqConditions.push(eq(prevClause.expression, new Value(prevValue)));
    }
    const operator = clause.compareOptions.direction === `asc` ? gt : lt;
    const comparison = operator(clause.expression, new Value(value));
    if (eqConditions.length === 0) {
      clauses.push(comparison);
    } else {
      const allConditions = [...eqConditions, comparison];
      clauses.push(allConditions.reduce((acc, cond) => and(acc, cond)));
    }
  }
  if (clauses.length === 1) {
    return clauses[0];
  }
  return clauses.reduce((acc, clause) => or(acc, clause));
}
class CollectionSubscription extends EventEmitter {
  constructor(collection, callback, options) {
    super();
    this.collection = collection;
    this.callback = callback;
    this.options = options;
    this.loadedInitialState = false;
    this.skipFiltering = false;
    this.snapshotSent = false;
    this.loadedSubsets = [];
    this.sentKeys = /* @__PURE__ */ new Set();
    this.limitedSnapshotRowCount = 0;
    this._status = `ready`;
    this.pendingLoadSubsetPromises = /* @__PURE__ */ new Set();
    this.isBufferingForTruncate = false;
    this.truncateBuffer = [];
    this.pendingTruncateRefetches = /* @__PURE__ */ new Set();
    if (options.onUnsubscribe) {
      this.on(`unsubscribed`, (event) => options.onUnsubscribe(event));
    }
    if (options.whereExpression) {
      ensureIndexForExpression(options.whereExpression, this.collection);
    }
    const callbackWithSentKeysTracking = (changes) => {
      callback(changes);
      this.trackSentKeys(changes);
    };
    this.callback = callbackWithSentKeysTracking;
    this.filteredCallback = options.whereExpression ? createFilteredCallback(this.callback, options) : this.callback;
    this.truncateCleanup = this.collection.on(`truncate`, () => {
      this.handleTruncate();
    });
  }
  get status() {
    return this._status;
  }
  /**
   * Handle collection truncate event by resetting state and re-requesting subsets.
   * This is called when the sync layer receives a must-refetch and clears all data.
   *
   * To prevent a flash of missing content, we buffer all changes (deletes from truncate
   * and inserts from refetch) until all loadSubset promises resolve, then emit them together.
   */
  handleTruncate() {
    const subsetsToReload = [...this.loadedSubsets];
    const hasLoadSubsetHandler = this.collection._sync.syncLoadSubsetFn !== null;
    if (subsetsToReload.length === 0 || !hasLoadSubsetHandler) {
      this.snapshotSent = false;
      this.loadedInitialState = false;
      this.limitedSnapshotRowCount = 0;
      this.lastSentKey = void 0;
      this.loadedSubsets = [];
      return;
    }
    this.isBufferingForTruncate = true;
    this.truncateBuffer = [];
    this.pendingTruncateRefetches.clear();
    this.snapshotSent = false;
    this.loadedInitialState = false;
    this.limitedSnapshotRowCount = 0;
    this.lastSentKey = void 0;
    this.loadedSubsets = [];
    queueMicrotask(() => {
      if (!this.isBufferingForTruncate) {
        return;
      }
      for (const options of subsetsToReload) {
        const syncResult = this.collection._sync.loadSubset(options);
        this.loadedSubsets.push(options);
        this.trackLoadSubsetPromise(syncResult);
        if (syncResult instanceof Promise) {
          this.pendingTruncateRefetches.add(syncResult);
          syncResult.catch(() => {
          }).finally(() => {
            this.pendingTruncateRefetches.delete(syncResult);
            this.checkTruncateRefetchComplete();
          });
        }
      }
      if (this.pendingTruncateRefetches.size === 0) {
        this.flushTruncateBuffer();
      }
    });
  }
  /**
   * Check if all truncate refetch promises have completed and flush buffer if so
   */
  checkTruncateRefetchComplete() {
    if (this.pendingTruncateRefetches.size === 0 && this.isBufferingForTruncate) {
      this.flushTruncateBuffer();
    }
  }
  /**
   * Flush the truncate buffer, emitting all buffered changes to the callback
   */
  flushTruncateBuffer() {
    this.isBufferingForTruncate = false;
    const merged = this.truncateBuffer.flat();
    if (merged.length > 0) {
      this.filteredCallback(merged);
    }
    this.truncateBuffer = [];
  }
  setOrderByIndex(index) {
    this.orderByIndex = index;
  }
  /**
   * Set subscription status and emit events if changed
   */
  setStatus(newStatus) {
    if (this._status === newStatus) {
      return;
    }
    const previousStatus = this._status;
    this._status = newStatus;
    this.emitInner(`status:change`, {
      type: `status:change`,
      subscription: this,
      previousStatus,
      status: newStatus
    });
    const eventKey = `status:${newStatus}`;
    this.emitInner(eventKey, {
      type: eventKey,
      subscription: this,
      previousStatus,
      status: newStatus
    });
  }
  /**
   * Track a loadSubset promise and manage loading status
   */
  trackLoadSubsetPromise(syncResult) {
    if (syncResult instanceof Promise) {
      this.pendingLoadSubsetPromises.add(syncResult);
      this.setStatus(`loadingSubset`);
      syncResult.finally(() => {
        this.pendingLoadSubsetPromises.delete(syncResult);
        if (this.pendingLoadSubsetPromises.size === 0) {
          this.setStatus(`ready`);
        }
      });
    }
  }
  hasLoadedInitialState() {
    return this.loadedInitialState;
  }
  hasSentAtLeastOneSnapshot() {
    return this.snapshotSent;
  }
  emitEvents(changes) {
    const newChanges = this.filterAndFlipChanges(changes);
    if (this.isBufferingForTruncate) {
      if (newChanges.length > 0) {
        this.truncateBuffer.push(newChanges);
      }
    } else {
      this.filteredCallback(newChanges);
    }
  }
  /**
   * Sends the snapshot to the callback.
   * Returns a boolean indicating if it succeeded.
   * It can only fail if there is no index to fulfill the request
   * and the optimizedOnly option is set to true,
   * or, the entire state was already loaded.
   */
  requestSnapshot(opts) {
    if (this.loadedInitialState) {
      return false;
    }
    const stateOpts = {
      where: this.options.whereExpression,
      optimizedOnly: opts?.optimizedOnly ?? false
    };
    if (opts) {
      if (`where` in opts) {
        const snapshotWhereExp = opts.where;
        if (stateOpts.where) {
          const subWhereExp = stateOpts.where;
          const combinedWhereExp = and(subWhereExp, snapshotWhereExp);
          stateOpts.where = combinedWhereExp;
        } else {
          stateOpts.where = snapshotWhereExp;
        }
      }
    } else {
      this.loadedInitialState = true;
    }
    const loadOptions = {
      where: stateOpts.where,
      subscription: this,
      // Include orderBy and limit if provided so sync layer can optimize the query
      orderBy: opts?.orderBy,
      limit: opts?.limit
    };
    const syncResult = this.collection._sync.loadSubset(loadOptions);
    opts?.onLoadSubsetResult?.(syncResult);
    this.loadedSubsets.push(loadOptions);
    const trackLoadSubsetPromise = opts?.trackLoadSubsetPromise ?? true;
    if (trackLoadSubsetPromise) {
      this.trackLoadSubsetPromise(syncResult);
    }
    const snapshot = this.collection.currentStateAsChanges(stateOpts);
    if (snapshot === void 0) {
      return false;
    }
    const filteredSnapshot = snapshot.filter(
      (change) => !this.sentKeys.has(change.key)
    );
    for (const change of filteredSnapshot) {
      this.sentKeys.add(change.key);
    }
    this.snapshotSent = true;
    this.callback(filteredSnapshot);
    return true;
  }
  /**
   * Sends a snapshot that fulfills the `where` clause and all rows are bigger or equal to the cursor.
   * Requires a range index to be set with `setOrderByIndex` prior to calling this method.
   * It uses that range index to load the items in the order of the index.
   *
   * For multi-column orderBy:
   * - Uses first value from `minValues` for LOCAL index operations (wide bounds, ensures no missed rows)
   * - Uses all `minValues` to build a precise composite cursor for SYNC layer loadSubset
   *
   * Note 1: it may load more rows than the provided LIMIT because it loads all values equal to the first cursor value + limit values greater.
   *         This is needed to ensure that it does not accidentally skip duplicate values when the limit falls in the middle of some duplicated values.
   * Note 2: it does not send keys that have already been sent before.
   */
  requestLimitedSnapshot({
    orderBy,
    limit,
    minValues,
    offset,
    trackLoadSubsetPromise: shouldTrackLoadSubsetPromise = true,
    onLoadSubsetResult
  }) {
    if (!limit) throw new Error(`limit is required`);
    if (!this.orderByIndex) {
      throw new Error(
        `Ordered snapshot was requested but no index was found. You have to call setOrderByIndex before requesting an ordered snapshot.`
      );
    }
    const hasMinValue = minValues !== void 0 && minValues.length > 0;
    const minValue = minValues?.[0];
    const minValueForIndex = minValue;
    const index = this.orderByIndex;
    const where = this.options.whereExpression;
    const whereFilterFn = where ? createFilterFunctionFromExpression(where) : void 0;
    const filterFn = (key) => {
      if (key !== void 0 && this.sentKeys.has(key)) {
        return false;
      }
      const value = this.collection.get(key);
      if (value === void 0) {
        return false;
      }
      return whereFilterFn?.(value) ?? true;
    };
    let biggestObservedValue = minValueForIndex;
    const changes = [];
    let keys = [];
    if (hasMinValue) {
      const { expression } = orderBy[0];
      const allRowsWithMinValue = this.collection.currentStateAsChanges({
        where: eq(expression, new Value(minValueForIndex))
      });
      if (allRowsWithMinValue) {
        const keysWithMinValue = allRowsWithMinValue.map((change) => change.key).filter((key) => !this.sentKeys.has(key) && filterFn(key));
        keys.push(...keysWithMinValue);
        const keysGreaterThanMin = index.take(
          limit - keys.length,
          minValueForIndex,
          filterFn
        );
        keys.push(...keysGreaterThanMin);
      } else {
        keys = index.take(limit, minValueForIndex, filterFn);
      }
    } else {
      keys = index.takeFromStart(limit, filterFn);
    }
    const valuesNeeded = () => Math.max(limit - changes.length, 0);
    const collectionExhausted = () => keys.length === 0;
    const orderByExpression = orderBy[0].expression;
    const valueExtractor = orderByExpression.type === `ref` ? compileExpression(new PropRef(orderByExpression.path), true) : null;
    while (valuesNeeded() > 0 && !collectionExhausted()) {
      const insertedKeys = /* @__PURE__ */ new Set();
      for (const key of keys) {
        const value = this.collection.get(key);
        changes.push({
          type: `insert`,
          key,
          value
        });
        biggestObservedValue = valueExtractor ? valueExtractor(value) : value;
        insertedKeys.add(key);
      }
      keys = index.take(valuesNeeded(), biggestObservedValue, filterFn);
    }
    const currentOffset = this.limitedSnapshotRowCount;
    for (const change of changes) {
      this.sentKeys.add(change.key);
    }
    this.callback(changes);
    this.limitedSnapshotRowCount += changes.length;
    if (changes.length > 0) {
      this.lastSentKey = changes[changes.length - 1].key;
    }
    let cursorExpressions;
    if (minValues !== void 0 && minValues.length > 0) {
      const whereFromCursor = buildCursor(orderBy, minValues);
      if (whereFromCursor) {
        const { expression } = orderBy[0];
        const cursorMinValue = minValues[0];
        let whereCurrentCursor;
        if (cursorMinValue instanceof Date) {
          const cursorMinValuePlus1ms = new Date(cursorMinValue.getTime() + 1);
          whereCurrentCursor = and(
            gte(expression, new Value(cursorMinValue)),
            lt(expression, new Value(cursorMinValuePlus1ms))
          );
        } else {
          whereCurrentCursor = eq(expression, new Value(cursorMinValue));
        }
        cursorExpressions = {
          whereFrom: whereFromCursor,
          whereCurrent: whereCurrentCursor,
          lastKey: this.lastSentKey
        };
      }
    }
    const loadOptions = {
      where,
      // Main filter only, no cursor
      limit,
      orderBy,
      cursor: cursorExpressions,
      // Cursor expressions passed separately
      offset: offset ?? currentOffset,
      // Use provided offset, or auto-tracked offset
      subscription: this
    };
    const syncResult = this.collection._sync.loadSubset(loadOptions);
    onLoadSubsetResult?.(syncResult);
    this.loadedSubsets.push(loadOptions);
    if (shouldTrackLoadSubsetPromise) {
      this.trackLoadSubsetPromise(syncResult);
    }
  }
  // TODO: also add similar test but that checks that it can also load it from the collection's loadSubset function
  //       and that that also works properly (i.e. does not skip duplicate values)
  /**
   * Filters and flips changes for keys that have not been sent yet.
   * Deletes are filtered out for keys that have not been sent yet.
   * Updates are flipped into inserts for keys that have not been sent yet.
   * Duplicate inserts are filtered out to prevent D2 multiplicity > 1.
   */
  filterAndFlipChanges(changes) {
    if (this.loadedInitialState || this.skipFiltering) {
      return changes;
    }
    const skipDeleteFilter = this.isBufferingForTruncate;
    const newChanges = [];
    for (const change of changes) {
      let newChange = change;
      const keyInSentKeys = this.sentKeys.has(change.key);
      if (!keyInSentKeys) {
        if (change.type === `update`) {
          newChange = { ...change, type: `insert`, previousValue: void 0 };
        } else if (change.type === `delete`) {
          if (!skipDeleteFilter) {
            continue;
          }
        }
        this.sentKeys.add(change.key);
      } else {
        if (change.type === `insert`) {
          continue;
        } else if (change.type === `delete`) {
          this.sentKeys.delete(change.key);
        }
      }
      newChanges.push(newChange);
    }
    return newChanges;
  }
  trackSentKeys(changes) {
    if (this.loadedInitialState || this.skipFiltering) {
      return;
    }
    for (const change of changes) {
      if (change.type === `delete`) {
        this.sentKeys.delete(change.key);
      } else {
        this.sentKeys.add(change.key);
      }
    }
    if (this.orderByIndex) {
      this.limitedSnapshotRowCount = Math.max(
        this.limitedSnapshotRowCount,
        this.sentKeys.size
      );
    }
  }
  /**
   * Mark that the subscription should not filter any changes.
   * This is used when includeInitialState is explicitly set to false,
   * meaning the caller doesn't want initial state but does want ALL future changes.
   */
  markAllStateAsSeen() {
    this.skipFiltering = true;
  }
  unsubscribe() {
    this.truncateCleanup?.();
    this.truncateCleanup = void 0;
    this.isBufferingForTruncate = false;
    this.truncateBuffer = [];
    this.pendingTruncateRefetches.clear();
    for (const options of this.loadedSubsets) {
      this.collection._sync.unloadSubset(options);
    }
    this.loadedSubsets = [];
    this.emitInner(`unsubscribed`, {
      type: `unsubscribed`,
      subscription: this
    });
    this.clearListeners();
  }
}
class CollectionChangesManager {
  /**
   * Creates a new CollectionChangesManager instance
   */
  constructor() {
    this.activeSubscribersCount = 0;
    this.changeSubscriptions = /* @__PURE__ */ new Set();
    this.batchedEvents = [];
    this.shouldBatchEvents = false;
  }
  setDeps(deps) {
    this.lifecycle = deps.lifecycle;
    this.sync = deps.sync;
    this.events = deps.events;
    this.collection = deps.collection;
  }
  /**
   * Emit an empty ready event to notify subscribers that the collection is ready
   * This bypasses the normal empty array check in emitEvents
   */
  emitEmptyReadyEvent() {
    for (const subscription of this.changeSubscriptions) {
      subscription.emitEvents([]);
    }
  }
  /**
   * Emit events either immediately or batch them for later emission
   */
  emitEvents(changes, forceEmit = false) {
    if (this.shouldBatchEvents && !forceEmit) {
      this.batchedEvents.push(...changes);
      return;
    }
    let eventsToEmit = changes;
    if (forceEmit) {
      if (this.batchedEvents.length > 0) {
        eventsToEmit = [...this.batchedEvents, ...changes];
      }
      this.batchedEvents = [];
      this.shouldBatchEvents = false;
    }
    if (eventsToEmit.length === 0) {
      return;
    }
    for (const subscription of this.changeSubscriptions) {
      subscription.emitEvents(eventsToEmit);
    }
  }
  /**
   * Subscribe to changes in the collection
   */
  subscribeChanges(callback, options = {}) {
    this.addSubscriber();
    if (options.where && options.whereExpression) {
      throw new Error(
        `Cannot specify both 'where' and 'whereExpression' options. Use one or the other.`
      );
    }
    const { where, ...opts } = options;
    let whereExpression = opts.whereExpression;
    if (where) {
      const proxy = createSingleRowRefProxy();
      const result = where(proxy);
      whereExpression = toExpression(result);
    }
    const subscription = new CollectionSubscription(this.collection, callback, {
      ...opts,
      whereExpression,
      onUnsubscribe: () => {
        this.removeSubscriber();
        this.changeSubscriptions.delete(subscription);
      }
    });
    if (options.onStatusChange) {
      subscription.on(`status:change`, options.onStatusChange);
    }
    if (options.includeInitialState) {
      subscription.requestSnapshot({
        trackLoadSubsetPromise: false,
        orderBy: options.orderBy,
        limit: options.limit,
        onLoadSubsetResult: options.onLoadSubsetResult
      });
    } else if (options.includeInitialState === false) {
      subscription.markAllStateAsSeen();
    }
    this.changeSubscriptions.add(subscription);
    return subscription;
  }
  /**
   * Increment the active subscribers count and start sync if needed
   */
  addSubscriber() {
    const previousSubscriberCount = this.activeSubscribersCount;
    this.activeSubscribersCount++;
    this.lifecycle.cancelGCTimer();
    if (this.lifecycle.status === `cleaned-up` || this.lifecycle.status === `idle`) {
      this.sync.startSync();
    }
    this.events.emitSubscribersChange(
      this.activeSubscribersCount,
      previousSubscriberCount
    );
  }
  /**
   * Decrement the active subscribers count and start GC timer if needed
   */
  removeSubscriber() {
    const previousSubscriberCount = this.activeSubscribersCount;
    this.activeSubscribersCount--;
    if (this.activeSubscribersCount === 0) {
      this.lifecycle.startGCTimer();
    } else if (this.activeSubscribersCount < 0) {
      throw new NegativeActiveSubscribersError();
    }
    this.events.emitSubscribersChange(
      this.activeSubscribersCount,
      previousSubscriberCount
    );
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  cleanup() {
    this.batchedEvents = [];
    this.shouldBatchEvents = false;
  }
}
const requestIdleCallbackPolyfill = (callback) => {
  const timeout = 0;
  const timeoutId = setTimeout(() => {
    callback({
      didTimeout: true,
      // Always indicate timeout for the polyfill
      timeRemaining: () => 50
      // Return some time remaining for polyfill
    });
  }, timeout);
  return timeoutId;
};
const cancelIdleCallbackPolyfill = (id) => {
  clearTimeout(id);
};
const safeRequestIdleCallback = typeof window !== `undefined` && `requestIdleCallback` in window ? (callback, options) => window.requestIdleCallback(callback, options) : (callback, _options) => requestIdleCallbackPolyfill(callback);
const safeCancelIdleCallback = typeof window !== `undefined` && `cancelIdleCallback` in window ? (id) => window.cancelIdleCallback(id) : cancelIdleCallbackPolyfill;
class CollectionLifecycleManager {
  /**
   * Creates a new CollectionLifecycleManager instance
   */
  constructor(config, id) {
    this.status = `idle`;
    this.hasBeenReady = false;
    this.hasReceivedFirstCommit = false;
    this.onFirstReadyCallbacks = [];
    this.gcTimeoutId = null;
    this.idleCallbackId = null;
    this.config = config;
    this.id = id;
  }
  setDeps(deps) {
    this.indexes = deps.indexes;
    this.events = deps.events;
    this.changes = deps.changes;
    this.sync = deps.sync;
    this.state = deps.state;
  }
  /**
   * Validates state transitions to prevent invalid status changes
   */
  validateStatusTransition(from, to) {
    if (from === to) {
      return;
    }
    const validTransitions = {
      idle: [`loading`, `error`, `cleaned-up`],
      loading: [`ready`, `error`, `cleaned-up`],
      ready: [`cleaned-up`, `error`],
      error: [`cleaned-up`, `idle`],
      "cleaned-up": [`loading`, `error`]
    };
    if (!validTransitions[from].includes(to)) {
      throw new InvalidCollectionStatusTransitionError(from, to, this.id);
    }
  }
  /**
   * Safely update the collection status with validation
   * @private
   */
  setStatus(newStatus, allowReady = false) {
    if (newStatus === `ready` && !allowReady) {
      throw new CollectionStateError(
        `You can't directly call "setStatus('ready'). You must use markReady instead.`
      );
    }
    this.validateStatusTransition(this.status, newStatus);
    const previousStatus = this.status;
    this.status = newStatus;
    if (newStatus === `ready` && !this.indexes.isIndexesResolved) {
      this.indexes.resolveAllIndexes().catch((error) => {
        console.warn(
          `${this.config.id ? `[${this.config.id}] ` : ``}Failed to resolve indexes:`,
          error
        );
      });
    }
    this.events.emitStatusChange(newStatus, previousStatus);
  }
  /**
   * Validates that the collection is in a usable state for data operations
   * @private
   */
  validateCollectionUsable(operation) {
    switch (this.status) {
      case `error`:
        throw new CollectionInErrorStateError(operation, this.id);
      case `cleaned-up`:
        this.sync.startSync();
        break;
    }
  }
  /**
   * Mark the collection as ready for use
   * This is called by sync implementations to explicitly signal that the collection is ready,
   * providing a more intuitive alternative to using commits for readiness signaling
   * @private - Should only be called by sync implementations
   */
  markReady() {
    this.validateStatusTransition(this.status, `ready`);
    if (this.status === `loading`) {
      this.setStatus(`ready`, true);
      if (!this.hasBeenReady) {
        this.hasBeenReady = true;
        if (!this.hasReceivedFirstCommit) {
          this.hasReceivedFirstCommit = true;
        }
        const callbacks = [...this.onFirstReadyCallbacks];
        this.onFirstReadyCallbacks = [];
        callbacks.forEach((callback) => callback());
      }
      if (this.changes.changeSubscriptions.size > 0) {
        this.changes.emitEmptyReadyEvent();
      }
    }
  }
  /**
   * Start the garbage collection timer
   * Called when the collection becomes inactive (no subscribers)
   */
  startGCTimer() {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId);
    }
    const gcTime = this.config.gcTime ?? 3e5;
    if (gcTime <= 0 || !Number.isFinite(gcTime)) {
      return;
    }
    this.gcTimeoutId = setTimeout(() => {
      if (this.changes.activeSubscribersCount === 0) {
        this.scheduleIdleCleanup();
      }
    }, gcTime);
  }
  /**
   * Cancel the garbage collection timer
   * Called when the collection becomes active again
   */
  cancelGCTimer() {
    if (this.gcTimeoutId) {
      clearTimeout(this.gcTimeoutId);
      this.gcTimeoutId = null;
    }
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    }
  }
  /**
   * Schedule cleanup to run during browser idle time
   * This prevents blocking the UI thread during cleanup operations
   */
  scheduleIdleCleanup() {
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId);
    }
    this.idleCallbackId = safeRequestIdleCallback(
      (deadline) => {
        if (this.changes.activeSubscribersCount === 0) {
          const cleanupCompleted = this.performCleanup(deadline);
          if (cleanupCompleted) {
            this.idleCallbackId = null;
          }
        } else {
          this.idleCallbackId = null;
        }
      },
      { timeout: 1e3 }
    );
  }
  /**
   * Perform cleanup operations, optionally in chunks during idle time
   * @returns true if cleanup was completed, false if it was rescheduled
   */
  performCleanup(deadline) {
    const hasTime = !deadline || deadline.timeRemaining() > 0 || deadline.didTimeout;
    if (hasTime) {
      this.sync.cleanup();
      this.state.cleanup();
      this.changes.cleanup();
      this.indexes.cleanup();
      if (this.gcTimeoutId) {
        clearTimeout(this.gcTimeoutId);
        this.gcTimeoutId = null;
      }
      this.hasBeenReady = false;
      const callbacks = [...this.onFirstReadyCallbacks];
      this.onFirstReadyCallbacks = [];
      callbacks.forEach((callback) => {
        try {
          callback();
        } catch (error) {
          console.error(
            `${this.config.id ? `[${this.config.id}] ` : ``}Error in onFirstReady callback during cleanup:`,
            error
          );
        }
      });
      this.setStatus(`cleaned-up`);
      this.events.cleanup();
      return true;
    } else {
      this.scheduleIdleCleanup();
      return false;
    }
  }
  /**
   * Register a callback to be executed when the collection first becomes ready
   * Useful for preloading collections
   * @param callback Function to call when the collection first becomes ready
   */
  onFirstReady(callback) {
    if (this.hasBeenReady) {
      callback();
      return;
    }
    this.onFirstReadyCallbacks.push(callback);
  }
  cleanup() {
    if (this.idleCallbackId !== null) {
      safeCancelIdleCallback(this.idleCallbackId);
      this.idleCallbackId = null;
    }
    this.performCleanup();
  }
}
const LIVE_QUERY_INTERNAL = /* @__PURE__ */ Symbol(`liveQueryInternal`);
class CollectionSyncManager {
  /**
   * Creates a new CollectionSyncManager instance
   */
  constructor(config, id) {
    this.preloadPromise = null;
    this.syncCleanupFn = null;
    this.syncLoadSubsetFn = null;
    this.syncUnloadSubsetFn = null;
    this.pendingLoadSubsetPromises = /* @__PURE__ */ new Set();
    this.config = config;
    this.id = id;
    this.syncMode = config.syncMode ?? `eager`;
  }
  setDeps(deps) {
    this.collection = deps.collection;
    this.state = deps.state;
    this.lifecycle = deps.lifecycle;
    this._events = deps.events;
  }
  /**
   * Start the sync process for this collection
   * This is called when the collection is first accessed or preloaded
   */
  startSync() {
    if (this.lifecycle.status !== `idle` && this.lifecycle.status !== `cleaned-up`) {
      return;
    }
    this.lifecycle.setStatus(`loading`);
    try {
      const syncRes = normalizeSyncFnResult(
        this.config.sync.sync({
          collection: this.collection,
          begin: (options) => {
            this.state.pendingSyncedTransactions.push({
              committed: false,
              operations: [],
              deletedKeys: /* @__PURE__ */ new Set(),
              immediate: options?.immediate
            });
          },
          write: (messageWithOptionalKey) => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (!pendingTransaction) {
              throw new NoPendingSyncTransactionWriteError();
            }
            if (pendingTransaction.committed) {
              throw new SyncTransactionAlreadyCommittedWriteError();
            }
            let key = void 0;
            if (`key` in messageWithOptionalKey) {
              key = messageWithOptionalKey.key;
            } else {
              key = this.config.getKey(messageWithOptionalKey.value);
            }
            let messageType = messageWithOptionalKey.type;
            if (messageWithOptionalKey.type === `insert`) {
              const insertingIntoExistingSynced = this.state.syncedData.has(key);
              const hasPendingDeleteForKey = pendingTransaction.deletedKeys.has(key);
              const isTruncateTransaction = pendingTransaction.truncate === true;
              if (insertingIntoExistingSynced && !hasPendingDeleteForKey && !isTruncateTransaction) {
                const existingValue = this.state.syncedData.get(key);
                const valuesEqual = existingValue !== void 0 && deepEquals(existingValue, messageWithOptionalKey.value);
                if (valuesEqual) {
                  messageType = `update`;
                } else {
                  const utils = this.config.utils;
                  const internal = utils[LIVE_QUERY_INTERNAL];
                  throw new DuplicateKeySyncError(key, this.id, {
                    hasCustomGetKey: internal?.hasCustomGetKey ?? false,
                    hasJoins: internal?.hasJoins ?? false,
                    hasDistinct: internal?.hasDistinct ?? false
                  });
                }
              }
            }
            const message = {
              ...messageWithOptionalKey,
              type: messageType,
              key
            };
            pendingTransaction.operations.push(message);
            if (messageType === `delete`) {
              pendingTransaction.deletedKeys.add(key);
            }
          },
          commit: () => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (!pendingTransaction) {
              throw new NoPendingSyncTransactionCommitError();
            }
            if (pendingTransaction.committed) {
              throw new SyncTransactionAlreadyCommittedError();
            }
            pendingTransaction.committed = true;
            this.state.commitPendingTransactions();
          },
          markReady: () => {
            this.lifecycle.markReady();
          },
          truncate: () => {
            const pendingTransaction = this.state.pendingSyncedTransactions[this.state.pendingSyncedTransactions.length - 1];
            if (!pendingTransaction) {
              throw new NoPendingSyncTransactionWriteError();
            }
            if (pendingTransaction.committed) {
              throw new SyncTransactionAlreadyCommittedWriteError();
            }
            pendingTransaction.operations = [];
            pendingTransaction.deletedKeys.clear();
            pendingTransaction.truncate = true;
            pendingTransaction.optimisticSnapshot = {
              upserts: new Map(this.state.optimisticUpserts),
              deletes: new Set(this.state.optimisticDeletes)
            };
          }
        })
      );
      this.syncCleanupFn = syncRes?.cleanup ?? null;
      this.syncLoadSubsetFn = syncRes?.loadSubset ?? null;
      this.syncUnloadSubsetFn = syncRes?.unloadSubset ?? null;
      if (this.syncMode === `on-demand` && !this.syncLoadSubsetFn) {
        throw new CollectionConfigurationError(
          `Collection "${this.id}" is configured with syncMode "on-demand" but the sync function did not return a loadSubset handler. Either provide a loadSubset handler or use syncMode "eager".`
        );
      }
    } catch (error) {
      this.lifecycle.setStatus(`error`);
      throw error;
    }
  }
  /**
   * Preload the collection data by starting sync if not already started
   * Multiple concurrent calls will share the same promise
   */
  preload() {
    if (this.preloadPromise) {
      return this.preloadPromise;
    }
    if (this.syncMode === `on-demand`) {
      console.warn(
        `${this.id ? `[${this.id}] ` : ``}Calling .preload() on a collection with syncMode "on-demand" is a no-op. In on-demand mode, data is only loaded when queries request it. Instead, create a live query and call .preload() on that to load the specific data you need. See https://tanstack.com/blog/tanstack-db-0.5-query-driven-sync for more details.`
      );
    }
    this.preloadPromise = new Promise((resolve, reject) => {
      if (this.lifecycle.status === `ready`) {
        resolve();
        return;
      }
      if (this.lifecycle.status === `error`) {
        reject(new CollectionIsInErrorStateError());
        return;
      }
      this.lifecycle.onFirstReady(() => {
        resolve();
      });
      if (this.lifecycle.status === `idle` || this.lifecycle.status === `cleaned-up`) {
        try {
          this.startSync();
        } catch (error) {
          reject(error);
          return;
        }
      }
    });
    return this.preloadPromise;
  }
  /**
   * Gets whether the collection is currently loading more data
   */
  get isLoadingSubset() {
    return this.pendingLoadSubsetPromises.size > 0;
  }
  /**
   * Tracks a load promise for isLoadingSubset state.
   * @internal This is for internal coordination (e.g., live-query glue code), not for general use.
   */
  trackLoadPromise(promise) {
    const loadingStarting = !this.isLoadingSubset;
    this.pendingLoadSubsetPromises.add(promise);
    if (loadingStarting) {
      this._events.emit(`loadingSubset:change`, {
        type: `loadingSubset:change`,
        collection: this.collection,
        isLoadingSubset: true,
        previousIsLoadingSubset: false,
        loadingSubsetTransition: `start`
      });
    }
    promise.finally(() => {
      const loadingEnding = this.pendingLoadSubsetPromises.size === 1 && this.pendingLoadSubsetPromises.has(promise);
      this.pendingLoadSubsetPromises.delete(promise);
      if (loadingEnding) {
        this._events.emit(`loadingSubset:change`, {
          type: `loadingSubset:change`,
          collection: this.collection,
          isLoadingSubset: false,
          previousIsLoadingSubset: true,
          loadingSubsetTransition: `end`
        });
      }
    });
  }
  /**
   * Requests the sync layer to load more data.
   * @param options Options to control what data is being loaded
   * @returns If data loading is asynchronous, this method returns a promise that resolves when the data is loaded.
   *          Returns true if no sync function is configured, if syncMode is 'eager', or if there is no work to do.
   */
  loadSubset(options) {
    if (this.syncMode === `eager`) {
      return true;
    }
    if (this.syncLoadSubsetFn) {
      const result = this.syncLoadSubsetFn(options);
      if (result instanceof Promise) {
        this.trackLoadPromise(result);
        return result;
      }
    }
    return true;
  }
  /**
   * Notifies the sync layer that a subset is no longer needed.
   * @param options Options that identify what data is being unloaded
   */
  unloadSubset(options) {
    if (this.syncUnloadSubsetFn) {
      this.syncUnloadSubsetFn(options);
    }
  }
  cleanup() {
    try {
      if (this.syncCleanupFn) {
        this.syncCleanupFn();
        this.syncCleanupFn = null;
      }
    } catch (error) {
      queueMicrotask(() => {
        if (error instanceof Error) {
          const wrappedError = new SyncCleanupError(this.id, error);
          wrappedError.cause = error;
          wrappedError.stack = error.stack;
          throw wrappedError;
        } else {
          throw new SyncCleanupError(this.id, error);
        }
      });
    }
    this.preloadPromise = null;
  }
}
function normalizeSyncFnResult(result) {
  if (typeof result === `function`) {
    return { cleanup: result };
  }
  if (typeof result === `object`) {
    return result;
  }
  return void 0;
}
function isConstructor(resolver) {
  return typeof resolver === `function` && resolver.prototype !== void 0 && resolver.prototype.constructor === resolver;
}
async function resolveIndexConstructor(resolver) {
  if (isConstructor(resolver)) {
    return resolver;
  } else {
    return await resolver();
  }
}
class LazyIndexWrapper {
  constructor(id, expression, name, resolver, options, collectionEntries) {
    this.id = id;
    this.expression = expression;
    this.name = name;
    this.resolver = resolver;
    this.options = options;
    this.collectionEntries = collectionEntries;
    this.indexPromise = null;
    this.resolvedIndex = null;
    if (isConstructor(this.resolver)) {
      this.resolvedIndex = new this.resolver(
        this.id,
        this.expression,
        this.name,
        this.options
      );
      if (this.collectionEntries) {
        this.resolvedIndex.build(this.collectionEntries);
      }
    }
  }
  /**
   * Resolve the actual index
   */
  async resolve() {
    if (this.resolvedIndex) {
      return this.resolvedIndex;
    }
    if (!this.indexPromise) {
      this.indexPromise = this.createIndex();
    }
    this.resolvedIndex = await this.indexPromise;
    return this.resolvedIndex;
  }
  /**
   * Check if already resolved
   */
  isResolved() {
    return this.resolvedIndex !== null;
  }
  /**
   * Get resolved index (throws if not ready)
   */
  getResolved() {
    if (!this.resolvedIndex) {
      throw new Error(
        `Index ${this.id} has not been resolved yet. Ensure collection is synced.`
      );
    }
    return this.resolvedIndex;
  }
  /**
   * Get the index ID
   */
  getId() {
    return this.id;
  }
  /**
   * Get the index name
   */
  getName() {
    return this.name;
  }
  /**
   * Get the index expression
   */
  getExpression() {
    return this.expression;
  }
  async createIndex() {
    const IndexClass = await resolveIndexConstructor(this.resolver);
    return new IndexClass(this.id, this.expression, this.name, this.options);
  }
}
class IndexProxy {
  constructor(indexId, lazyIndex) {
    this.indexId = indexId;
    this.lazyIndex = lazyIndex;
  }
  /**
   * Get the resolved index (throws if not ready)
   */
  get index() {
    return this.lazyIndex.getResolved();
  }
  /**
   * Check if index is ready
   */
  get isReady() {
    return this.lazyIndex.isResolved();
  }
  /**
   * Wait for index to be ready
   */
  async whenReady() {
    return await this.lazyIndex.resolve();
  }
  /**
   * Get the index ID
   */
  get id() {
    return this.indexId;
  }
  /**
   * Get the index name (throws if not ready)
   */
  get name() {
    if (this.isReady) {
      return this.index.name;
    }
    return this.lazyIndex.getName();
  }
  /**
   * Get the index expression (available immediately)
   */
  get expression() {
    return this.lazyIndex.getExpression();
  }
  /**
   * Check if index supports an operation (throws if not ready)
   */
  supports(operation) {
    return this.index.supports(operation);
  }
  /**
   * Get index statistics (throws if not ready)
   */
  getStats() {
    return this.index.getStats();
  }
  /**
   * Check if index matches a field path (available immediately)
   */
  matchesField(fieldPath) {
    const expr = this.expression;
    return expr.type === `ref` && expr.path.length === fieldPath.length && expr.path.every((part, i) => part === fieldPath[i]);
  }
  /**
   * Get the key count (throws if not ready)
   */
  get keyCount() {
    return this.index.keyCount;
  }
  // Test compatibility properties - delegate to resolved index
  get indexedKeysSet() {
    const resolved = this.index;
    return resolved.indexedKeysSet;
  }
  get orderedEntriesArray() {
    const resolved = this.index;
    return resolved.orderedEntriesArray;
  }
  get valueMapData() {
    const resolved = this.index;
    return resolved.valueMapData;
  }
  // BTreeIndex compatibility methods
  equalityLookup(value) {
    const resolved = this.index;
    return resolved.equalityLookup?.(value) ?? /* @__PURE__ */ new Set();
  }
  rangeQuery(options) {
    const resolved = this.index;
    return resolved.rangeQuery?.(options) ?? /* @__PURE__ */ new Set();
  }
  inArrayLookup(values) {
    const resolved = this.index;
    return resolved.inArrayLookup?.(values) ?? /* @__PURE__ */ new Set();
  }
  // Internal method for the collection to get the lazy wrapper
  _getLazyWrapper() {
    return this.lazyIndex;
  }
}
class CollectionIndexesManager {
  constructor() {
    this.lazyIndexes = /* @__PURE__ */ new Map();
    this.resolvedIndexes = /* @__PURE__ */ new Map();
    this.isIndexesResolved = false;
    this.indexCounter = 0;
  }
  setDeps(deps) {
    this.state = deps.state;
    this.lifecycle = deps.lifecycle;
  }
  /**
   * Creates an index on a collection for faster queries.
   */
  createIndex(indexCallback, config = {}) {
    this.lifecycle.validateCollectionUsable(`createIndex`);
    const indexId = ++this.indexCounter;
    const singleRowRefProxy = createSingleRowRefProxy();
    const indexExpression = indexCallback(singleRowRefProxy);
    const expression = toExpression(indexExpression);
    const resolver = config.indexType ?? BTreeIndex;
    const lazyIndex = new LazyIndexWrapper(
      indexId,
      expression,
      config.name,
      resolver,
      config.options,
      this.state.entries()
    );
    this.lazyIndexes.set(indexId, lazyIndex);
    if (resolver === BTreeIndex) {
      try {
        const resolvedIndex = lazyIndex.getResolved();
        this.resolvedIndexes.set(indexId, resolvedIndex);
      } catch (error) {
        console.warn(`Failed to resolve BTreeIndex:`, error);
      }
    } else if (typeof resolver === `function` && resolver.prototype) {
      try {
        const resolvedIndex = lazyIndex.getResolved();
        this.resolvedIndexes.set(indexId, resolvedIndex);
      } catch {
        this.resolveSingleIndex(indexId, lazyIndex).catch((error) => {
          console.warn(`Failed to resolve single index:`, error);
        });
      }
    } else if (this.isIndexesResolved) {
      this.resolveSingleIndex(indexId, lazyIndex).catch((error) => {
        console.warn(`Failed to resolve single index:`, error);
      });
    }
    return new IndexProxy(indexId, lazyIndex);
  }
  /**
   * Resolve all lazy indexes (called when collection first syncs)
   */
  async resolveAllIndexes() {
    if (this.isIndexesResolved) return;
    const resolutionPromises = Array.from(this.lazyIndexes.entries()).map(
      async ([indexId, lazyIndex]) => {
        const resolvedIndex = await lazyIndex.resolve();
        resolvedIndex.build(this.state.entries());
        this.resolvedIndexes.set(indexId, resolvedIndex);
        return { indexId, resolvedIndex };
      }
    );
    await Promise.all(resolutionPromises);
    this.isIndexesResolved = true;
  }
  /**
   * Resolve a single index immediately
   */
  async resolveSingleIndex(indexId, lazyIndex) {
    const resolvedIndex = await lazyIndex.resolve();
    resolvedIndex.build(this.state.entries());
    this.resolvedIndexes.set(indexId, resolvedIndex);
    return resolvedIndex;
  }
  /**
   * Get resolved indexes for query optimization
   */
  get indexes() {
    return this.resolvedIndexes;
  }
  /**
   * Updates all indexes when the collection changes
   */
  updateIndexes(changes) {
    for (const index of this.resolvedIndexes.values()) {
      for (const change of changes) {
        switch (change.type) {
          case `insert`:
            index.add(change.key, change.value);
            break;
          case `update`:
            if (change.previousValue) {
              index.update(change.key, change.previousValue, change.value);
            } else {
              index.add(change.key, change.value);
            }
            break;
          case `delete`:
            index.remove(change.key, change.value);
            break;
        }
      }
    }
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  cleanup() {
    this.lazyIndexes.clear();
    this.resolvedIndexes.clear();
  }
}
const CALLBACK_ITERATION_METHODS = /* @__PURE__ */ new Set([
  `find`,
  `findLast`,
  `findIndex`,
  `findLastIndex`,
  `filter`,
  `map`,
  `flatMap`,
  `forEach`,
  `some`,
  `every`,
  `reduce`,
  `reduceRight`
]);
const ARRAY_MODIFYING_METHODS = /* @__PURE__ */ new Set([
  `pop`,
  `push`,
  `shift`,
  `unshift`,
  `splice`,
  `sort`,
  `reverse`,
  `fill`,
  `copyWithin`
]);
const MAP_SET_MODIFYING_METHODS = /* @__PURE__ */ new Set([`set`, `delete`, `clear`, `add`]);
const MAP_SET_ITERATOR_METHODS = /* @__PURE__ */ new Set([
  `entries`,
  `keys`,
  `values`,
  `forEach`
]);
function isProxiableObject(value) {
  return value !== null && typeof value === `object` && !(value instanceof Date) && !(value instanceof RegExp) && !isTemporal(value);
}
function createArrayIterationHandler(methodName, methodFn, changeTracker, memoizedCreateChangeProxy) {
  if (!CALLBACK_ITERATION_METHODS.has(methodName)) {
    return void 0;
  }
  return function(...args) {
    const callback = args[0];
    if (typeof callback !== `function`) {
      return methodFn.apply(changeTracker.copy_, args);
    }
    const getProxiedElement = (element, index) => {
      if (isProxiableObject(element)) {
        const nestedParent = {
          tracker: changeTracker,
          prop: String(index)
        };
        const { proxy: elementProxy } = memoizedCreateChangeProxy(
          element,
          nestedParent
        );
        return elementProxy;
      }
      return element;
    };
    const wrappedCallback = function(element, index, array) {
      const proxiedElement = getProxiedElement(element, index);
      return callback.call(this, proxiedElement, index, array);
    };
    if (methodName === `reduce` || methodName === `reduceRight`) {
      const reduceCallback = function(accumulator, element, index, array) {
        const proxiedElement = getProxiedElement(element, index);
        return callback.call(this, accumulator, proxiedElement, index, array);
      };
      return methodFn.apply(changeTracker.copy_, [
        reduceCallback,
        ...args.slice(1)
      ]);
    }
    const result = methodFn.apply(changeTracker.copy_, [
      wrappedCallback,
      ...args.slice(1)
    ]);
    if ((methodName === `find` || methodName === `findLast`) && result && typeof result === `object`) {
      const foundIndex = changeTracker.copy_.indexOf(result);
      if (foundIndex !== -1) {
        return getProxiedElement(result, foundIndex);
      }
    }
    if (methodName === `filter` && Array.isArray(result)) {
      return result.map((element) => {
        const originalIndex = changeTracker.copy_.indexOf(element);
        if (originalIndex !== -1) {
          return getProxiedElement(element, originalIndex);
        }
        return element;
      });
    }
    return result;
  };
}
function createArrayIteratorHandler(changeTracker, memoizedCreateChangeProxy) {
  return function() {
    const array = changeTracker.copy_;
    let index = 0;
    return {
      next() {
        if (index >= array.length) {
          return { done: true, value: void 0 };
        }
        const element = array[index];
        let proxiedElement = element;
        if (isProxiableObject(element)) {
          const nestedParent = {
            tracker: changeTracker,
            prop: String(index)
          };
          const { proxy: elementProxy } = memoizedCreateChangeProxy(
            element,
            nestedParent
          );
          proxiedElement = elementProxy;
        }
        index++;
        return { done: false, value: proxiedElement };
      },
      [Symbol.iterator]() {
        return this;
      }
    };
  };
}
function createModifyingMethodHandler(methodFn, changeTracker, markChanged) {
  return function(...args) {
    const result = methodFn.apply(changeTracker.copy_, args);
    markChanged(changeTracker);
    return result;
  };
}
function createMapSetIteratorHandler(methodName, prop, methodFn, target, changeTracker, memoizedCreateChangeProxy, markChanged) {
  const isIteratorMethod = MAP_SET_ITERATOR_METHODS.has(methodName) || prop === Symbol.iterator;
  if (!isIteratorMethod) {
    return void 0;
  }
  return function(...args) {
    const result = methodFn.apply(changeTracker.copy_, args);
    if (methodName === `forEach`) {
      const callback = args[0];
      if (typeof callback === `function`) {
        const wrappedCallback = function(value, key, collection) {
          const cbresult = callback.call(this, value, key, collection);
          markChanged(changeTracker);
          return cbresult;
        };
        return methodFn.apply(target, [wrappedCallback, ...args.slice(1)]);
      }
    }
    const isValueIterator = methodName === `entries` || methodName === `values` || methodName === Symbol.iterator.toString() || prop === Symbol.iterator;
    if (isValueIterator) {
      const originalIterator = result;
      const valueToKeyMap = /* @__PURE__ */ new Map();
      if (methodName === `values` && target instanceof Map) {
        for (const [key, mapValue] of changeTracker.copy_.entries()) {
          valueToKeyMap.set(mapValue, key);
        }
      }
      const originalToModifiedMap = /* @__PURE__ */ new Map();
      if (target instanceof Set) {
        for (const setValue of changeTracker.copy_.values()) {
          originalToModifiedMap.set(setValue, setValue);
        }
      }
      return {
        next() {
          const nextResult = originalIterator.next();
          if (!nextResult.done && nextResult.value && typeof nextResult.value === `object`) {
            if (methodName === `entries` && Array.isArray(nextResult.value) && nextResult.value.length === 2) {
              if (nextResult.value[1] && typeof nextResult.value[1] === `object`) {
                const mapKey = nextResult.value[0];
                const mapParent = {
                  tracker: changeTracker,
                  prop: mapKey,
                  updateMap: (newValue) => {
                    if (changeTracker.copy_ instanceof Map) {
                      changeTracker.copy_.set(
                        mapKey,
                        newValue
                      );
                    }
                  }
                };
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value[1],
                  mapParent
                );
                nextResult.value[1] = valueProxy;
              }
            } else if (methodName === `values` || methodName === Symbol.iterator.toString() || prop === Symbol.iterator) {
              if (methodName === `values` && target instanceof Map) {
                const mapKey = valueToKeyMap.get(nextResult.value);
                if (mapKey !== void 0) {
                  const mapParent = {
                    tracker: changeTracker,
                    prop: mapKey,
                    updateMap: (newValue) => {
                      if (changeTracker.copy_ instanceof Map) {
                        changeTracker.copy_.set(
                          mapKey,
                          newValue
                        );
                      }
                    }
                  };
                  const { proxy: valueProxy } = memoizedCreateChangeProxy(
                    nextResult.value,
                    mapParent
                  );
                  nextResult.value = valueProxy;
                }
              } else if (target instanceof Set) {
                const setOriginalValue = nextResult.value;
                const setParent = {
                  tracker: changeTracker,
                  prop: setOriginalValue,
                  updateSet: (newValue) => {
                    if (changeTracker.copy_ instanceof Set) {
                      changeTracker.copy_.delete(
                        setOriginalValue
                      );
                      changeTracker.copy_.add(newValue);
                      originalToModifiedMap.set(setOriginalValue, newValue);
                    }
                  }
                };
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value,
                  setParent
                );
                nextResult.value = valueProxy;
              } else {
                const tempKey = /* @__PURE__ */ Symbol(`iterator-value`);
                const { proxy: valueProxy } = memoizedCreateChangeProxy(
                  nextResult.value,
                  {
                    tracker: changeTracker,
                    prop: tempKey
                  }
                );
                nextResult.value = valueProxy;
              }
            }
          }
          return nextResult;
        },
        [Symbol.iterator]() {
          return this;
        }
      };
    }
    return result;
  };
}
function debugLog(...args) {
  const isBrowser = typeof window !== `undefined` && typeof localStorage !== `undefined`;
  if (isBrowser && localStorage.getItem(`DEBUG`) === `true`) {
    console.log(`[proxy]`, ...args);
  } else if (
    // true
    !isBrowser && typeof process !== `undefined` && process.env.DEBUG === `true`
  ) {
    console.log(`[proxy]`, ...args);
  }
}
function deepClone(obj, visited = /* @__PURE__ */ new WeakMap()) {
  if (obj === null || obj === void 0) {
    return obj;
  }
  if (typeof obj !== `object`) {
    return obj;
  }
  if (visited.has(obj)) {
    return visited.get(obj);
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags);
  }
  if (Array.isArray(obj)) {
    const arrayClone = [];
    visited.set(obj, arrayClone);
    obj.forEach((item, index) => {
      arrayClone[index] = deepClone(item, visited);
    });
    return arrayClone;
  }
  if (ArrayBuffer.isView(obj) && !(obj instanceof DataView)) {
    const TypedArrayConstructor = Object.getPrototypeOf(obj).constructor;
    const clone2 = new TypedArrayConstructor(
      obj.length
    );
    visited.set(obj, clone2);
    for (let i = 0; i < obj.length; i++) {
      clone2[i] = obj[i];
    }
    return clone2;
  }
  if (obj instanceof Map) {
    const clone2 = /* @__PURE__ */ new Map();
    visited.set(obj, clone2);
    obj.forEach((value, key) => {
      clone2.set(key, deepClone(value, visited));
    });
    return clone2;
  }
  if (obj instanceof Set) {
    const clone2 = /* @__PURE__ */ new Set();
    visited.set(obj, clone2);
    obj.forEach((value) => {
      clone2.add(deepClone(value, visited));
    });
    return clone2;
  }
  if (isTemporal(obj)) {
    return obj;
  }
  const clone = {};
  visited.set(obj, clone);
  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      clone[key] = deepClone(
        obj[key],
        visited
      );
    }
  }
  const symbolProps = Object.getOwnPropertySymbols(obj);
  for (const sym of symbolProps) {
    clone[sym] = deepClone(
      obj[sym],
      visited
    );
  }
  return clone;
}
let count = 0;
function getProxyCount() {
  count += 1;
  return count;
}
function createChangeProxy(target, parent) {
  const changeProxyCache = /* @__PURE__ */ new Map();
  function memoizedCreateChangeProxy(innerTarget, innerParent) {
    debugLog(`Object ID:`, innerTarget.constructor.name);
    if (changeProxyCache.has(innerTarget)) {
      return changeProxyCache.get(innerTarget);
    } else {
      const changeProxy = createChangeProxy(innerTarget, innerParent);
      changeProxyCache.set(innerTarget, changeProxy);
      return changeProxy;
    }
  }
  const proxyCache = /* @__PURE__ */ new Map();
  const changeTracker = {
    copy_: deepClone(target),
    originalObject: deepClone(target),
    proxyCount: getProxyCount(),
    modified: false,
    assigned_: {},
    parent,
    target
    // Store reference to the target object
  };
  debugLog(
    `createChangeProxy called for target`,
    target,
    changeTracker.proxyCount
  );
  function markChanged(state) {
    if (!state.modified) {
      state.modified = true;
    }
    if (state.parent) {
      debugLog(`propagating change to parent`);
      if (`updateMap` in state.parent) {
        state.parent.updateMap(state.copy_);
      } else if (`updateSet` in state.parent) {
        state.parent.updateSet(state.copy_);
      } else {
        state.parent.tracker.copy_[state.parent.prop] = state.copy_;
        state.parent.tracker.assigned_[state.parent.prop] = true;
      }
      markChanged(state.parent.tracker);
    }
  }
  function checkIfReverted(state) {
    debugLog(
      `checkIfReverted called with assigned keys:`,
      Object.keys(state.assigned_)
    );
    if (Object.keys(state.assigned_).length === 0 && Object.getOwnPropertySymbols(state.assigned_).length === 0) {
      debugLog(`No assigned properties, returning true`);
      return true;
    }
    for (const prop in state.assigned_) {
      if (state.assigned_[prop] === true) {
        const currentValue = state.copy_[prop];
        const originalValue = state.originalObject[prop];
        debugLog(
          `Checking property ${String(prop)}, current:`,
          currentValue,
          `original:`,
          originalValue
        );
        if (!deepEquals(currentValue, originalValue)) {
          debugLog(`Property ${String(prop)} is different, returning false`);
          return false;
        }
      } else if (state.assigned_[prop] === false) {
        debugLog(`Property ${String(prop)} was deleted, returning false`);
        return false;
      }
    }
    const symbolProps = Object.getOwnPropertySymbols(state.assigned_);
    for (const sym of symbolProps) {
      if (state.assigned_[sym] === true) {
        const currentValue = state.copy_[sym];
        const originalValue = state.originalObject[sym];
        if (!deepEquals(currentValue, originalValue)) {
          debugLog(`Symbol property is different, returning false`);
          return false;
        }
      } else if (state.assigned_[sym] === false) {
        debugLog(`Symbol property was deleted, returning false`);
        return false;
      }
    }
    debugLog(`All properties match original values, returning true`);
    return true;
  }
  function checkParentStatus(parentState, childProp) {
    debugLog(`checkParentStatus called for child prop:`, childProp);
    const isReverted = checkIfReverted(parentState);
    debugLog(`Parent checkIfReverted returned:`, isReverted);
    if (isReverted) {
      debugLog(`Parent is fully reverted, clearing tracking`);
      parentState.modified = false;
      parentState.assigned_ = {};
      if (parentState.parent) {
        debugLog(`Continuing up the parent chain`);
        checkParentStatus(parentState.parent.tracker, parentState.parent.prop);
      }
    }
  }
  function createObjectProxy(obj) {
    debugLog(`createObjectProxy`, obj);
    if (proxyCache.has(obj)) {
      debugLog(`proxyCache found match`);
      return proxyCache.get(obj);
    }
    const proxy2 = new Proxy(obj, {
      get(ptarget, prop) {
        debugLog(`get`, ptarget, prop);
        const value = changeTracker.copy_[prop] ?? changeTracker.originalObject[prop];
        const originalValue = changeTracker.originalObject[prop];
        debugLog(`value (at top of proxy get)`, value);
        const desc = Object.getOwnPropertyDescriptor(ptarget, prop);
        if (desc?.get) {
          return value;
        }
        if (typeof value === `function`) {
          if (Array.isArray(ptarget)) {
            const methodName = prop.toString();
            if (ARRAY_MODIFYING_METHODS.has(methodName)) {
              return createModifyingMethodHandler(
                value,
                changeTracker,
                markChanged
              );
            }
            const iterationHandler = createArrayIterationHandler(
              methodName,
              value,
              changeTracker,
              memoizedCreateChangeProxy
            );
            if (iterationHandler) {
              return iterationHandler;
            }
            if (prop === Symbol.iterator) {
              return createArrayIteratorHandler(
                changeTracker,
                memoizedCreateChangeProxy
              );
            }
          }
          if (ptarget instanceof Map || ptarget instanceof Set) {
            const methodName = prop.toString();
            if (MAP_SET_MODIFYING_METHODS.has(methodName)) {
              return createModifyingMethodHandler(
                value,
                changeTracker,
                markChanged
              );
            }
            const iteratorHandler = createMapSetIteratorHandler(
              methodName,
              prop,
              value,
              ptarget,
              changeTracker,
              memoizedCreateChangeProxy,
              markChanged
            );
            if (iteratorHandler) {
              return iteratorHandler;
            }
          }
          return value.bind(ptarget);
        }
        if (isProxiableObject(value)) {
          const nestedParent = {
            tracker: changeTracker,
            prop: String(prop)
          };
          const { proxy: nestedProxy } = memoizedCreateChangeProxy(
            originalValue,
            nestedParent
          );
          proxyCache.set(value, nestedProxy);
          return nestedProxy;
        }
        return value;
      },
      set(_sobj, prop, value) {
        const currentValue = changeTracker.copy_[prop];
        debugLog(
          `set called for property ${String(prop)}, current:`,
          currentValue,
          `new:`,
          value
        );
        if (!deepEquals(currentValue, value)) {
          const originalValue = changeTracker.originalObject[prop];
          const isRevertToOriginal = deepEquals(value, originalValue);
          debugLog(
            `value:`,
            value,
            `original:`,
            originalValue,
            `isRevertToOriginal:`,
            isRevertToOriginal
          );
          if (isRevertToOriginal) {
            debugLog(`Reverting property ${String(prop)} to original value`);
            delete changeTracker.assigned_[prop.toString()];
            debugLog(`Updating copy with original value for ${String(prop)}`);
            changeTracker.copy_[prop] = deepClone(originalValue);
            debugLog(`Checking if all properties reverted`);
            const allReverted = checkIfReverted(changeTracker);
            debugLog(`All reverted:`, allReverted);
            if (allReverted) {
              debugLog(`All properties reverted, clearing tracking`);
              changeTracker.modified = false;
              changeTracker.assigned_ = {};
              if (parent) {
                debugLog(`Updating parent for property:`, parent.prop);
                checkParentStatus(parent.tracker, parent.prop);
              }
            } else {
              debugLog(`Some properties still changed, keeping modified flag`);
              changeTracker.modified = true;
            }
          } else {
            debugLog(`Setting new value for property ${String(prop)}`);
            changeTracker.copy_[prop] = value;
            changeTracker.assigned_[prop.toString()] = true;
            debugLog(`Marking object and ancestors as modified`, changeTracker);
            markChanged(changeTracker);
          }
        } else {
          debugLog(`Value unchanged, not tracking`);
        }
        return true;
      },
      defineProperty(ptarget, prop, descriptor) {
        const result = Reflect.defineProperty(ptarget, prop, descriptor);
        if (result && `value` in descriptor) {
          changeTracker.copy_[prop] = deepClone(descriptor.value);
          changeTracker.assigned_[prop.toString()] = true;
          markChanged(changeTracker);
        }
        return result;
      },
      getOwnPropertyDescriptor(ptarget, prop) {
        return Reflect.getOwnPropertyDescriptor(ptarget, prop);
      },
      preventExtensions(ptarget) {
        return Reflect.preventExtensions(ptarget);
      },
      isExtensible(ptarget) {
        return Reflect.isExtensible(ptarget);
      },
      deleteProperty(dobj, prop) {
        debugLog(`deleteProperty`, dobj, prop);
        const stringProp = typeof prop === `symbol` ? prop.toString() : prop;
        if (stringProp in dobj) {
          const hadPropertyInOriginal = stringProp in changeTracker.originalObject;
          const result = Reflect.deleteProperty(dobj, prop);
          if (result) {
            if (!hadPropertyInOriginal) {
              delete changeTracker.assigned_[stringProp];
              if (Object.keys(changeTracker.assigned_).length === 0 && Object.getOwnPropertySymbols(changeTracker.assigned_).length === 0) {
                changeTracker.modified = false;
              } else {
                changeTracker.modified = true;
              }
            } else {
              changeTracker.assigned_[stringProp] = false;
              markChanged(changeTracker);
            }
          }
          return result;
        }
        return true;
      }
    });
    proxyCache.set(obj, proxy2);
    return proxy2;
  }
  const proxy = createObjectProxy(changeTracker.copy_);
  return {
    proxy,
    getChanges: () => {
      debugLog(`getChanges called, modified:`, changeTracker.modified);
      debugLog(changeTracker);
      if (!changeTracker.modified) {
        debugLog(`Object not modified, returning empty object`);
        return {};
      }
      if (typeof changeTracker.copy_ !== `object` || Array.isArray(changeTracker.copy_)) {
        return changeTracker.copy_;
      }
      if (Object.keys(changeTracker.assigned_).length === 0) {
        return changeTracker.copy_;
      }
      const result = {};
      for (const key in changeTracker.copy_) {
        if (changeTracker.assigned_[key] === true && key in changeTracker.copy_) {
          result[key] = changeTracker.copy_[key];
        }
      }
      debugLog(`Returning copy:`, result);
      return result;
    }
  };
}
function createArrayChangeProxy(targets) {
  const proxiesWithChanges = targets.map((target) => createChangeProxy(target));
  return {
    proxies: proxiesWithChanges.map((p) => p.proxy),
    getChanges: () => proxiesWithChanges.map((p) => p.getChanges())
  };
}
function withChangeTracking(target, callback) {
  const { proxy, getChanges } = createChangeProxy(target);
  callback(proxy);
  return getChanges();
}
function withArrayChangeTracking(targets, callback) {
  const { proxies, getChanges } = createArrayChangeProxy(targets);
  callback(proxies);
  return getChanges();
}
function createDeferred() {
  let resolve;
  let reject;
  let isPending = true;
  const promise = new Promise((res, rej) => {
    resolve = (value) => {
      isPending = false;
      res(value);
    };
    reject = (reason) => {
      isPending = false;
      rej(reason);
    };
  });
  return {
    promise,
    resolve,
    reject,
    isPending: () => isPending
  };
}
function isPendingAwareJob(dep) {
  return typeof dep === `object` && dep !== null && typeof dep.hasPendingGraphRun === `function`;
}
class Scheduler {
  constructor() {
    this.contexts = /* @__PURE__ */ new Map();
    this.clearListeners = /* @__PURE__ */ new Set();
  }
  /**
   * Get or create the state bucket for a context.
   */
  getOrCreateContext(contextId) {
    let context = this.contexts.get(contextId);
    if (!context) {
      context = {
        queue: [],
        jobs: /* @__PURE__ */ new Map(),
        dependencies: /* @__PURE__ */ new Map(),
        completed: /* @__PURE__ */ new Set()
      };
      this.contexts.set(contextId, context);
    }
    return context;
  }
  /**
   * Schedule work. Without a context id, executes immediately.
   * Otherwise queues the job to be flushed once dependencies are satisfied.
   * Scheduling the same jobId again replaces the previous run function.
   */
  schedule({ contextId, jobId, dependencies, run }) {
    if (typeof contextId === `undefined`) {
      run();
      return;
    }
    const context = this.getOrCreateContext(contextId);
    if (!context.jobs.has(jobId)) {
      context.queue.push(jobId);
    }
    context.jobs.set(jobId, run);
    if (dependencies) {
      const depSet = new Set(dependencies);
      depSet.delete(jobId);
      context.dependencies.set(jobId, depSet);
    } else if (!context.dependencies.has(jobId)) {
      context.dependencies.set(jobId, /* @__PURE__ */ new Set());
    }
    context.completed.delete(jobId);
  }
  /**
   * Flush all queued work for a context. Jobs with unmet dependencies are retried.
   * Throws if a pass completes without running any job (dependency cycle).
   */
  flush(contextId) {
    const context = this.contexts.get(contextId);
    if (!context) return;
    const { queue, jobs, dependencies, completed } = context;
    while (queue.length > 0) {
      let ranThisPass = false;
      const jobsThisPass = queue.length;
      for (let i = 0; i < jobsThisPass; i++) {
        const jobId = queue.shift();
        const run = jobs.get(jobId);
        if (!run) {
          dependencies.delete(jobId);
          completed.delete(jobId);
          continue;
        }
        const deps = dependencies.get(jobId);
        let ready = !deps;
        if (deps) {
          ready = true;
          for (const dep of deps) {
            if (dep === jobId) continue;
            const depHasPending = isPendingAwareJob(dep) && dep.hasPendingGraphRun(contextId);
            if (jobs.has(dep) && !completed.has(dep) || !jobs.has(dep) && depHasPending) {
              ready = false;
              break;
            }
          }
        }
        if (ready) {
          jobs.delete(jobId);
          dependencies.delete(jobId);
          run();
          completed.add(jobId);
          ranThisPass = true;
        } else {
          queue.push(jobId);
        }
      }
      if (!ranThisPass) {
        throw new Error(
          `Scheduler detected unresolved dependencies for context ${String(
            contextId
          )}.`
        );
      }
    }
    this.contexts.delete(contextId);
  }
  /**
   * Flush all contexts with pending work. Useful during tear-down.
   */
  flushAll() {
    for (const contextId of Array.from(this.contexts.keys())) {
      this.flush(contextId);
    }
  }
  /** Clear all scheduled jobs for a context. */
  clear(contextId) {
    this.contexts.delete(contextId);
    this.clearListeners.forEach((listener) => listener(contextId));
  }
  /** Register a listener to be notified when a context is cleared. */
  onClear(listener) {
    this.clearListeners.add(listener);
    return () => this.clearListeners.delete(listener);
  }
  /** Check if a context has pending jobs. */
  hasPendingJobs(contextId) {
    const context = this.contexts.get(contextId);
    return !!context && context.jobs.size > 0;
  }
  /** Remove a single job from a context and clean up its dependencies. */
  clearJob(contextId, jobId) {
    const context = this.contexts.get(contextId);
    if (!context) return;
    context.jobs.delete(jobId);
    context.dependencies.delete(jobId);
    context.completed.delete(jobId);
    context.queue = context.queue.filter((id) => id !== jobId);
    if (context.jobs.size === 0) {
      this.contexts.delete(contextId);
    }
  }
}
const transactionScopedScheduler = new Scheduler();
const transactions = [];
let transactionStack = [];
let sequenceNumber = 0;
function mergePendingMutations(existing, incoming) {
  switch (`${existing.type}-${incoming.type}`) {
    case `insert-update`: {
      return {
        ...existing,
        type: `insert`,
        original: {},
        modified: incoming.modified,
        changes: { ...existing.changes, ...incoming.changes },
        // Keep existing keys (key changes not allowed in updates)
        key: existing.key,
        globalKey: existing.globalKey,
        // Merge metadata (last-write-wins)
        metadata: incoming.metadata ?? existing.metadata,
        syncMetadata: { ...existing.syncMetadata, ...incoming.syncMetadata },
        // Update tracking info
        mutationId: incoming.mutationId,
        updatedAt: incoming.updatedAt
      };
    }
    case `insert-delete`:
      return null;
    case `update-delete`:
      return incoming;
    case `update-update`: {
      return {
        ...incoming,
        // Keep original from first update
        original: existing.original,
        // Union the changes from both updates
        changes: { ...existing.changes, ...incoming.changes },
        // Merge metadata
        metadata: incoming.metadata ?? existing.metadata,
        syncMetadata: { ...existing.syncMetadata, ...incoming.syncMetadata }
      };
    }
    case `delete-delete`:
    case `insert-insert`:
      return incoming;
    default: {
      const _exhaustive = `${existing.type}-${incoming.type}`;
      throw new Error(`Unhandled mutation combination: ${_exhaustive}`);
    }
  }
}
function createTransaction(config) {
  const newTransaction = new Transaction(config);
  transactions.push(newTransaction);
  return newTransaction;
}
function getActiveTransaction() {
  if (transactionStack.length > 0) {
    return transactionStack.slice(-1)[0];
  } else {
    return void 0;
  }
}
function registerTransaction(tx) {
  transactionScopedScheduler.clear(tx.id);
  transactionStack.push(tx);
}
function unregisterTransaction(tx) {
  try {
    transactionScopedScheduler.flush(tx.id);
  } finally {
    transactionStack = transactionStack.filter((t) => t.id !== tx.id);
  }
}
function removeFromPendingList(tx) {
  const index = transactions.findIndex((t) => t.id === tx.id);
  if (index !== -1) {
    transactions.splice(index, 1);
  }
}
class Transaction {
  constructor(config) {
    if (typeof config.mutationFn === `undefined`) {
      throw new MissingMutationFunctionError();
    }
    this.id = config.id ?? crypto.randomUUID();
    this.mutationFn = config.mutationFn;
    this.state = `pending`;
    this.mutations = [];
    this.isPersisted = createDeferred();
    this.autoCommit = config.autoCommit ?? true;
    this.createdAt = /* @__PURE__ */ new Date();
    this.sequenceNumber = sequenceNumber++;
    this.metadata = config.metadata ?? {};
  }
  setState(newState) {
    this.state = newState;
    if (newState === `completed` || newState === `failed`) {
      removeFromPendingList(this);
    }
  }
  /**
   * Execute collection operations within this transaction
   * @param callback - Function containing collection operations to group together. If the
   * callback returns a Promise, the transaction context will remain active until the promise
   * settles, allowing optimistic writes after `await` boundaries.
   * @returns This transaction for chaining
   * @example
   * // Group multiple operations
   * const tx = createTransaction({ mutationFn: async () => {
   *   // Send to API
   * }})
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Buy milk" })
   *   collection.update("2", draft => { draft.completed = true })
   *   collection.delete("3")
   * })
   *
   * await tx.isPersisted.promise
   *
   * @example
   * // Handle mutate errors
   * try {
   *   tx.mutate(() => {
   *     collection.insert({ id: "invalid" }) // This might throw
   *   })
   * } catch (error) {
   *   console.log('Mutation failed:', error)
   * }
   *
   * @example
   * // Manual commit control
   * const tx = createTransaction({ autoCommit: false, mutationFn: async () => {} })
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Item" })
   * })
   *
   * // Commit later when ready
   * await tx.commit()
   */
  mutate(callback) {
    if (this.state !== `pending`) {
      throw new TransactionNotPendingMutateError();
    }
    registerTransaction(this);
    try {
      callback();
    } finally {
      unregisterTransaction(this);
    }
    if (this.autoCommit) {
      this.commit().catch(() => {
      });
    }
    return this;
  }
  /**
   * Apply new mutations to this transaction, intelligently merging with existing mutations
   *
   * When mutations operate on the same item (same globalKey), they are merged according to
   * the following rules:
   *
   * - **insert + update** → insert (merge changes, keep empty original)
   * - **insert + delete** → removed (mutations cancel each other out)
   * - **update + delete** → delete (delete dominates)
   * - **update + update** → update (union changes, keep first original)
   * - **same type** → replace with latest
   *
   * This merging reduces over-the-wire churn and keeps the optimistic local view
   * aligned with user intent.
   *
   * @param mutations - Array of new mutations to apply
   */
  applyMutations(mutations) {
    for (const newMutation of mutations) {
      const existingIndex = this.mutations.findIndex(
        (m) => m.globalKey === newMutation.globalKey
      );
      if (existingIndex >= 0) {
        const existingMutation = this.mutations[existingIndex];
        const mergeResult = mergePendingMutations(existingMutation, newMutation);
        if (mergeResult === null) {
          this.mutations.splice(existingIndex, 1);
        } else {
          this.mutations[existingIndex] = mergeResult;
        }
      } else {
        this.mutations.push(newMutation);
      }
    }
  }
  /**
   * Rollback the transaction and any conflicting transactions
   * @param config - Configuration for rollback behavior
   * @returns This transaction for chaining
   * @example
   * // Manual rollback
   * const tx = createTransaction({ mutationFn: async () => {
   *   // Send to API
   * }})
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Buy milk" })
   * })
   *
   * // Rollback if needed
   * if (shouldCancel) {
   *   tx.rollback()
   * }
   *
   * @example
   * // Handle rollback cascade (automatic)
   * const tx1 = createTransaction({ mutationFn: async () => {} })
   * const tx2 = createTransaction({ mutationFn: async () => {} })
   *
   * tx1.mutate(() => collection.update("1", draft => { draft.value = "A" }))
   * tx2.mutate(() => collection.update("1", draft => { draft.value = "B" })) // Same item
   *
   * tx1.rollback() // This will also rollback tx2 due to conflict
   *
   * @example
   * // Handle rollback in error scenarios
   * try {
   *   await tx.isPersisted.promise
   * } catch (error) {
   *   console.log('Transaction was rolled back:', error)
   *   // Transaction automatically rolled back on mutation function failure
   * }
   */
  rollback(config) {
    const isSecondaryRollback = config?.isSecondaryRollback ?? false;
    if (this.state === `completed`) {
      throw new TransactionAlreadyCompletedRollbackError();
    }
    this.setState(`failed`);
    if (!isSecondaryRollback) {
      const mutationIds = /* @__PURE__ */ new Set();
      this.mutations.forEach((m) => mutationIds.add(m.globalKey));
      for (const t of transactions) {
        t.state === `pending` && t.mutations.some((m) => mutationIds.has(m.globalKey)) && t.rollback({ isSecondaryRollback: true });
      }
    }
    this.isPersisted.reject(this.error?.error);
    this.touchCollection();
    return this;
  }
  // Tell collection that something has changed with the transaction
  touchCollection() {
    const hasCalled = /* @__PURE__ */ new Set();
    for (const mutation of this.mutations) {
      if (!hasCalled.has(mutation.collection.id)) {
        mutation.collection._state.onTransactionStateChange();
        if (mutation.collection._state.pendingSyncedTransactions.length > 0) {
          mutation.collection._state.commitPendingTransactions();
        }
        hasCalled.add(mutation.collection.id);
      }
    }
  }
  /**
   * Commit the transaction and execute the mutation function
   * @returns Promise that resolves to this transaction when complete
   * @example
   * // Manual commit (when autoCommit is false)
   * const tx = createTransaction({
   *   autoCommit: false,
   *   mutationFn: async ({ transaction }) => {
   *     await api.saveChanges(transaction.mutations)
   *   }
   * })
   *
   * tx.mutate(() => {
   *   collection.insert({ id: "1", text: "Buy milk" })
   * })
   *
   * await tx.commit() // Manually commit
   *
   * @example
   * // Handle commit errors
   * try {
   *   const tx = createTransaction({
   *     mutationFn: async () => { throw new Error("API failed") }
   *   })
   *
   *   tx.mutate(() => {
   *     collection.insert({ id: "1", text: "Item" })
   *   })
   *
   *   await tx.commit()
   * } catch (error) {
   *   console.log('Commit failed, transaction rolled back:', error)
   * }
   *
   * @example
   * // Check transaction state after commit
   * await tx.commit()
   * console.log(tx.state) // "completed" or "failed"
   */
  async commit() {
    if (this.state !== `pending`) {
      throw new TransactionNotPendingCommitError();
    }
    this.setState(`persisting`);
    if (this.mutations.length === 0) {
      this.setState(`completed`);
      this.isPersisted.resolve(this);
      return this;
    }
    try {
      await this.mutationFn({
        transaction: this
      });
      this.setState(`completed`);
      this.touchCollection();
      this.isPersisted.resolve(this);
    } catch (error) {
      const originalError = error instanceof Error ? error : new Error(String(error));
      this.error = {
        message: originalError.message,
        error: originalError
      };
      this.rollback();
      throw originalError;
    }
    return this;
  }
  /**
   * Compare two transactions by their createdAt time and sequence number in order
   * to sort them in the order they were created.
   * @param other - The other transaction to compare to
   * @returns -1 if this transaction was created before the other, 1 if it was created after, 0 if they were created at the same time
   */
  compareCreatedAt(other) {
    const createdAtComparison = this.createdAt.getTime() - other.createdAt.getTime();
    if (createdAtComparison !== 0) {
      return createdAtComparison;
    }
    return this.sequenceNumber - other.sequenceNumber;
  }
}
class CollectionMutationsManager {
  constructor(config, id) {
    this.insert = (data, config2) => {
      this.lifecycle.validateCollectionUsable(`insert`);
      const state = this.state;
      const ambientTransaction = getActiveTransaction();
      if (!ambientTransaction && !this.config.onInsert) {
        throw new MissingInsertHandlerError();
      }
      const items = Array.isArray(data) ? data : [data];
      const mutations = [];
      const keysInCurrentBatch = /* @__PURE__ */ new Set();
      items.forEach((item) => {
        const validatedData = this.validateData(item, `insert`);
        const key = this.config.getKey(validatedData);
        if (this.state.has(key) || keysInCurrentBatch.has(key)) {
          throw new DuplicateKeyError(key);
        }
        keysInCurrentBatch.add(key);
        const globalKey = this.generateGlobalKey(key, item);
        const mutation = {
          mutationId: crypto.randomUUID(),
          original: {},
          modified: validatedData,
          // Pick the values from validatedData based on what's passed in - this is for cases
          // where a schema has default values. The validated data has the extra default
          // values but for changes, we just want to show the data that was actually passed in.
          changes: Object.fromEntries(
            Object.keys(item).map((k) => [
              k,
              validatedData[k]
            ])
          ),
          globalKey,
          key,
          metadata: config2?.metadata,
          syncMetadata: this.config.sync.getSyncMetadata?.() || {},
          optimistic: config2?.optimistic ?? true,
          type: `insert`,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          collection: this.collection
        };
        mutations.push(mutation);
      });
      if (ambientTransaction) {
        ambientTransaction.applyMutations(mutations);
        state.transactions.set(ambientTransaction.id, ambientTransaction);
        state.scheduleTransactionCleanup(ambientTransaction);
        state.recomputeOptimisticState(true);
        return ambientTransaction;
      } else {
        const directOpTransaction = createTransaction({
          mutationFn: async (params) => {
            return await this.config.onInsert({
              transaction: params.transaction,
              collection: this.collection
            });
          }
        });
        directOpTransaction.applyMutations(mutations);
        directOpTransaction.commit().catch(() => void 0);
        state.transactions.set(directOpTransaction.id, directOpTransaction);
        state.scheduleTransactionCleanup(directOpTransaction);
        state.recomputeOptimisticState(true);
        return directOpTransaction;
      }
    };
    this.delete = (keys, config2) => {
      const state = this.state;
      this.lifecycle.validateCollectionUsable(`delete`);
      const ambientTransaction = getActiveTransaction();
      if (!ambientTransaction && !this.config.onDelete) {
        throw new MissingDeleteHandlerError();
      }
      if (Array.isArray(keys) && keys.length === 0) {
        throw new NoKeysPassedToDeleteError();
      }
      const keysArray = Array.isArray(keys) ? keys : [keys];
      const mutations = [];
      for (const key of keysArray) {
        if (!this.state.has(key)) {
          throw new DeleteKeyNotFoundError(key);
        }
        const globalKey = this.generateGlobalKey(key, this.state.get(key));
        const mutation = {
          mutationId: crypto.randomUUID(),
          original: this.state.get(key),
          modified: this.state.get(key),
          changes: this.state.get(key),
          globalKey,
          key,
          metadata: config2?.metadata,
          syncMetadata: state.syncedMetadata.get(key) || {},
          optimistic: config2?.optimistic ?? true,
          type: `delete`,
          createdAt: /* @__PURE__ */ new Date(),
          updatedAt: /* @__PURE__ */ new Date(),
          collection: this.collection
        };
        mutations.push(mutation);
      }
      if (ambientTransaction) {
        ambientTransaction.applyMutations(mutations);
        state.transactions.set(ambientTransaction.id, ambientTransaction);
        state.scheduleTransactionCleanup(ambientTransaction);
        state.recomputeOptimisticState(true);
        return ambientTransaction;
      }
      const directOpTransaction = createTransaction({
        autoCommit: true,
        mutationFn: async (params) => {
          return this.config.onDelete({
            transaction: params.transaction,
            collection: this.collection
          });
        }
      });
      directOpTransaction.applyMutations(mutations);
      directOpTransaction.commit().catch(() => void 0);
      state.transactions.set(directOpTransaction.id, directOpTransaction);
      state.scheduleTransactionCleanup(directOpTransaction);
      state.recomputeOptimisticState(true);
      return directOpTransaction;
    };
    this.id = id;
    this.config = config;
  }
  setDeps(deps) {
    this.lifecycle = deps.lifecycle;
    this.state = deps.state;
    this.collection = deps.collection;
  }
  ensureStandardSchema(schema) {
    if (schema && `~standard` in schema) {
      return schema;
    }
    throw new InvalidSchemaError();
  }
  validateData(data, type, key) {
    if (!this.config.schema) return data;
    const standardSchema = this.ensureStandardSchema(this.config.schema);
    if (type === `update` && key) {
      const existingData = this.state.get(key);
      if (existingData && data && typeof data === `object` && typeof existingData === `object`) {
        const mergedData = Object.assign({}, existingData, data);
        const result2 = standardSchema[`~standard`].validate(mergedData);
        if (result2 instanceof Promise) {
          throw new SchemaMustBeSynchronousError();
        }
        if (`issues` in result2 && result2.issues) {
          const typedIssues = result2.issues.map((issue) => ({
            message: issue.message,
            path: issue.path?.map((p) => String(p))
          }));
          throw new SchemaValidationError(type, typedIssues);
        }
        const validatedMergedData = result2.value;
        const modifiedKeys = Object.keys(data);
        const extractedChanges = Object.fromEntries(
          modifiedKeys.map((k) => [k, validatedMergedData[k]])
        );
        return extractedChanges;
      }
    }
    const result = standardSchema[`~standard`].validate(data);
    if (result instanceof Promise) {
      throw new SchemaMustBeSynchronousError();
    }
    if (`issues` in result && result.issues) {
      const typedIssues = result.issues.map((issue) => ({
        message: issue.message,
        path: issue.path?.map((p) => String(p))
      }));
      throw new SchemaValidationError(type, typedIssues);
    }
    return result.value;
  }
  generateGlobalKey(key, item) {
    if (typeof key !== `string` && typeof key !== `number`) {
      if (typeof key === `undefined`) {
        throw new UndefinedKeyError(item);
      }
      throw new InvalidKeyError(key, item);
    }
    return `KEY::${this.id}/${key}`;
  }
  /**
   * Updates one or more items in the collection using a callback function
   */
  update(keys, configOrCallback, maybeCallback) {
    if (typeof keys === `undefined`) {
      throw new MissingUpdateArgumentError();
    }
    const state = this.state;
    this.lifecycle.validateCollectionUsable(`update`);
    const ambientTransaction = getActiveTransaction();
    if (!ambientTransaction && !this.config.onUpdate) {
      throw new MissingUpdateHandlerError();
    }
    const isArray = Array.isArray(keys);
    const keysArray = isArray ? keys : [keys];
    if (isArray && keysArray.length === 0) {
      throw new NoKeysPassedToUpdateError();
    }
    const callback = typeof configOrCallback === `function` ? configOrCallback : maybeCallback;
    const config = typeof configOrCallback === `function` ? {} : configOrCallback;
    const currentObjects = keysArray.map((key) => {
      const item = this.state.get(key);
      if (!item) {
        throw new UpdateKeyNotFoundError(key);
      }
      return item;
    });
    let changesArray;
    if (isArray) {
      changesArray = withArrayChangeTracking(
        currentObjects,
        callback
      );
    } else {
      const result = withChangeTracking(
        currentObjects[0],
        callback
      );
      changesArray = [result];
    }
    const mutations = keysArray.map((key, index) => {
      const itemChanges = changesArray[index];
      if (!itemChanges || Object.keys(itemChanges).length === 0) {
        return null;
      }
      const originalItem = currentObjects[index];
      const validatedUpdatePayload = this.validateData(
        itemChanges,
        `update`,
        key
      );
      const modifiedItem = Object.assign(
        {},
        originalItem,
        validatedUpdatePayload
      );
      const originalItemId = this.config.getKey(originalItem);
      const modifiedItemId = this.config.getKey(modifiedItem);
      if (originalItemId !== modifiedItemId) {
        throw new KeyUpdateNotAllowedError(originalItemId, modifiedItemId);
      }
      const globalKey = this.generateGlobalKey(modifiedItemId, modifiedItem);
      return {
        mutationId: crypto.randomUUID(),
        original: originalItem,
        modified: modifiedItem,
        // Pick the values from modifiedItem based on what's passed in - this is for cases
        // where a schema has default values or transforms. The modified data has the extra
        // default or transformed values but for changes, we just want to show the data that
        // was actually passed in.
        changes: Object.fromEntries(
          Object.keys(itemChanges).map((k) => [
            k,
            modifiedItem[k]
          ])
        ),
        globalKey,
        key,
        metadata: config.metadata,
        syncMetadata: state.syncedMetadata.get(key) || {},
        optimistic: config.optimistic ?? true,
        type: `update`,
        createdAt: /* @__PURE__ */ new Date(),
        updatedAt: /* @__PURE__ */ new Date(),
        collection: this.collection
      };
    }).filter(Boolean);
    if (mutations.length === 0) {
      const emptyTransaction = createTransaction({
        mutationFn: async () => {
        }
      });
      emptyTransaction.commit().catch(() => void 0);
      state.scheduleTransactionCleanup(emptyTransaction);
      return emptyTransaction;
    }
    if (ambientTransaction) {
      ambientTransaction.applyMutations(mutations);
      state.transactions.set(ambientTransaction.id, ambientTransaction);
      state.scheduleTransactionCleanup(ambientTransaction);
      state.recomputeOptimisticState(true);
      return ambientTransaction;
    }
    const directOpTransaction = createTransaction({
      mutationFn: async (params) => {
        return this.config.onUpdate({
          transaction: params.transaction,
          collection: this.collection
        });
      }
    });
    directOpTransaction.applyMutations(mutations);
    directOpTransaction.commit().catch(() => void 0);
    state.transactions.set(directOpTransaction.id, directOpTransaction);
    state.scheduleTransactionCleanup(directOpTransaction);
    state.recomputeOptimisticState(true);
    return directOpTransaction;
  }
}
class CollectionEventsManager extends EventEmitter {
  constructor() {
    super();
  }
  setDeps(deps) {
    this.collection = deps.collection;
  }
  /**
   * Emit an event to all listeners
   * Public API for emitting collection events
   */
  emit(event, eventPayload) {
    this.emitInner(event, eventPayload);
  }
  emitStatusChange(status, previousStatus) {
    this.emit(`status:change`, {
      type: `status:change`,
      collection: this.collection,
      previousStatus,
      status
    });
    const eventKey = `status:${status}`;
    this.emit(eventKey, {
      type: eventKey,
      collection: this.collection,
      previousStatus,
      status
    });
  }
  emitSubscribersChange(subscriberCount, previousSubscriberCount) {
    this.emit(`subscribers:change`, {
      type: `subscribers:change`,
      collection: this.collection,
      previousSubscriberCount,
      subscriberCount
    });
  }
  cleanup() {
    this.clearListeners();
  }
}
function createCollection(options) {
  const collection = new CollectionImpl(
    options
  );
  if (options.utils) {
    collection.utils = options.utils;
  } else {
    collection.utils = {};
  }
  return collection;
}
class CollectionImpl {
  /**
   * Creates a new Collection instance
   *
   * @param config - Configuration object for the collection
   * @throws Error if sync config is missing
   */
  constructor(config) {
    this.utils = {};
    this.insert = (data, config2) => {
      return this._mutations.insert(data, config2);
    };
    this.delete = (keys, config2) => {
      return this._mutations.delete(keys, config2);
    };
    if (!config) {
      throw new CollectionRequiresConfigError();
    }
    if (!config.sync) {
      throw new CollectionRequiresSyncConfigError();
    }
    if (config.id) {
      this.id = config.id;
    } else {
      this.id = crypto.randomUUID();
    }
    this.config = {
      ...config,
      autoIndex: config.autoIndex ?? `eager`
    };
    this._changes = new CollectionChangesManager();
    this._events = new CollectionEventsManager();
    this._indexes = new CollectionIndexesManager();
    this._lifecycle = new CollectionLifecycleManager(config, this.id);
    this._mutations = new CollectionMutationsManager(config, this.id);
    this._state = new CollectionStateManager(config);
    this._sync = new CollectionSyncManager(config, this.id);
    this.comparisonOpts = buildCompareOptionsFromConfig(config);
    this._changes.setDeps({
      collection: this,
      // Required for passing to CollectionSubscription
      lifecycle: this._lifecycle,
      sync: this._sync,
      events: this._events
    });
    this._events.setDeps({
      collection: this
      // Required for adding to emitted events
    });
    this._indexes.setDeps({
      state: this._state,
      lifecycle: this._lifecycle
    });
    this._lifecycle.setDeps({
      changes: this._changes,
      events: this._events,
      indexes: this._indexes,
      state: this._state,
      sync: this._sync
    });
    this._mutations.setDeps({
      collection: this,
      // Required for passing to config.onInsert/onUpdate/onDelete and annotating mutations
      lifecycle: this._lifecycle,
      state: this._state
    });
    this._state.setDeps({
      collection: this,
      // Required for filtering events to only include this collection
      lifecycle: this._lifecycle,
      changes: this._changes,
      indexes: this._indexes,
      events: this._events
    });
    this._sync.setDeps({
      collection: this,
      // Required for passing to config.sync callback
      state: this._state,
      lifecycle: this._lifecycle,
      events: this._events
    });
    if (config.startSync === true) {
      this._sync.startSync();
    }
  }
  /**
   * Gets the current status of the collection
   */
  get status() {
    return this._lifecycle.status;
  }
  /**
   * Get the number of subscribers to the collection
   */
  get subscriberCount() {
    return this._changes.activeSubscribersCount;
  }
  /**
   * Register a callback to be executed when the collection first becomes ready
   * Useful for preloading collections
   * @param callback Function to call when the collection first becomes ready
   * @example
   * collection.onFirstReady(() => {
   *   console.log('Collection is ready for the first time')
   *   // Safe to access collection.state now
   * })
   */
  onFirstReady(callback) {
    return this._lifecycle.onFirstReady(callback);
  }
  /**
   * Check if the collection is ready for use
   * Returns true if the collection has been marked as ready by its sync implementation
   * @returns true if the collection is ready, false otherwise
   * @example
   * if (collection.isReady()) {
   *   console.log('Collection is ready, data is available')
   *   // Safe to access collection.state
   * } else {
   *   console.log('Collection is still loading')
   * }
   */
  isReady() {
    return this._lifecycle.status === `ready`;
  }
  /**
   * Check if the collection is currently loading more data
   * @returns true if the collection has pending load more operations, false otherwise
   */
  get isLoadingSubset() {
    return this._sync.isLoadingSubset;
  }
  /**
   * Start sync immediately - internal method for compiled queries
   * This bypasses lazy loading for special cases like live query results
   */
  startSyncImmediate() {
    this._sync.startSync();
  }
  /**
   * Preload the collection data by starting sync if not already started
   * Multiple concurrent calls will share the same promise
   */
  preload() {
    return this._sync.preload();
  }
  /**
   * Get the current value for a key (virtual derived state)
   */
  get(key) {
    return this._state.get(key);
  }
  /**
   * Check if a key exists in the collection (virtual derived state)
   */
  has(key) {
    return this._state.has(key);
  }
  /**
   * Get the current size of the collection (cached)
   */
  get size() {
    return this._state.size;
  }
  /**
   * Get all keys (virtual derived state)
   */
  *keys() {
    yield* this._state.keys();
  }
  /**
   * Get all values (virtual derived state)
   */
  *values() {
    yield* this._state.values();
  }
  /**
   * Get all entries (virtual derived state)
   */
  *entries() {
    yield* this._state.entries();
  }
  /**
   * Get all entries (virtual derived state)
   */
  *[Symbol.iterator]() {
    yield* this._state[Symbol.iterator]();
  }
  /**
   * Execute a callback for each entry in the collection
   */
  forEach(callbackfn) {
    return this._state.forEach(callbackfn);
  }
  /**
   * Create a new array with the results of calling a function for each entry in the collection
   */
  map(callbackfn) {
    return this._state.map(callbackfn);
  }
  getKeyFromItem(item) {
    return this.config.getKey(item);
  }
  /**
   * Creates an index on a collection for faster queries.
   * Indexes significantly improve query performance by allowing constant time lookups
   * and logarithmic time range queries instead of full scans.
   *
   * @template TResolver - The type of the index resolver (constructor or async loader)
   * @param indexCallback - Function that extracts the indexed value from each item
   * @param config - Configuration including index type and type-specific options
   * @returns An index proxy that provides access to the index when ready
   *
   * @example
   * // Create a default B+ tree index
   * const ageIndex = collection.createIndex((row) => row.age)
   *
   * // Create a ordered index with custom options
   * const ageIndex = collection.createIndex((row) => row.age, {
   *   indexType: BTreeIndex,
   *   options: {
   *     compareFn: customComparator,
   *     compareOptions: { direction: 'asc', nulls: 'first', stringSort: 'lexical' }
   *   },
   *   name: 'age_btree'
   * })
   *
   * // Create an async-loaded index
   * const textIndex = collection.createIndex((row) => row.content, {
   *   indexType: async () => {
   *     const { FullTextIndex } = await import('./indexes/fulltext.js')
   *     return FullTextIndex
   *   },
   *   options: { language: 'en' }
   * })
   */
  createIndex(indexCallback, config = {}) {
    return this._indexes.createIndex(indexCallback, config);
  }
  /**
   * Get resolved indexes for query optimization
   */
  get indexes() {
    return this._indexes.indexes;
  }
  /**
   * Validates the data against the schema
   */
  validateData(data, type, key) {
    return this._mutations.validateData(data, type, key);
  }
  get compareOptions() {
    return { ...this.comparisonOpts };
  }
  update(keys, configOrCallback, maybeCallback) {
    return this._mutations.update(keys, configOrCallback, maybeCallback);
  }
  /**
   * Gets the current state of the collection as a Map
   * @returns Map containing all items in the collection, with keys as identifiers
   * @example
   * const itemsMap = collection.state
   * console.log(`Collection has ${itemsMap.size} items`)
   *
   * for (const [key, item] of itemsMap) {
   *   console.log(`${key}: ${item.title}`)
   * }
   *
   * // Check if specific item exists
   * if (itemsMap.has("todo-1")) {
   *   console.log("Todo 1 exists:", itemsMap.get("todo-1"))
   * }
   */
  get state() {
    const result = /* @__PURE__ */ new Map();
    for (const [key, value] of this.entries()) {
      result.set(key, value);
    }
    return result;
  }
  /**
   * Gets the current state of the collection as a Map, but only resolves when data is available
   * Waits for the first sync commit to complete before resolving
   *
   * @returns Promise that resolves to a Map containing all items in the collection
   */
  stateWhenReady() {
    if (this.size > 0 || this.isReady()) {
      return Promise.resolve(this.state);
    }
    return this.preload().then(() => this.state);
  }
  /**
   * Gets the current state of the collection as an Array
   *
   * @returns An Array containing all items in the collection
   */
  get toArray() {
    return Array.from(this.values());
  }
  /**
   * Gets the current state of the collection as an Array, but only resolves when data is available
   * Waits for the first sync commit to complete before resolving
   *
   * @returns Promise that resolves to an Array containing all items in the collection
   */
  toArrayWhenReady() {
    if (this.size > 0 || this.isReady()) {
      return Promise.resolve(this.toArray);
    }
    return this.preload().then(() => this.toArray);
  }
  /**
   * Returns the current state of the collection as an array of changes
   * @param options - Options including optional where filter
   * @returns An array of changes
   * @example
   * // Get all items as changes
   * const allChanges = collection.currentStateAsChanges()
   *
   * // Get only items matching a condition
   * const activeChanges = collection.currentStateAsChanges({
   *   where: (row) => row.status === 'active'
   * })
   *
   * // Get only items using a pre-compiled expression
   * const activeChanges = collection.currentStateAsChanges({
   *   whereExpression: eq(row.status, 'active')
   * })
   */
  currentStateAsChanges(options = {}) {
    return currentStateAsChanges(this, options);
  }
  /**
   * Subscribe to changes in the collection
   * @param callback - Function called when items change
   * @param options - Subscription options including includeInitialState and where filter
   * @returns Unsubscribe function - Call this to stop listening for changes
   * @example
   * // Basic subscription
   * const subscription = collection.subscribeChanges((changes) => {
   *   changes.forEach(change => {
   *     console.log(`${change.type}: ${change.key}`, change.value)
   *   })
   * })
   *
   * // Later: subscription.unsubscribe()
   *
   * @example
   * // Include current state immediately
   * const subscription = collection.subscribeChanges((changes) => {
   *   updateUI(changes)
   * }, { includeInitialState: true })
   *
   * @example
   * // Subscribe only to changes matching a condition using where callback
   * import { eq } from "@tanstack/db"
   *
   * const subscription = collection.subscribeChanges((changes) => {
   *   updateUI(changes)
   * }, {
   *   includeInitialState: true,
   *   where: (row) => eq(row.status, "active")
   * })
   *
   * @example
   * // Using multiple conditions with and()
   * import { and, eq, gt } from "@tanstack/db"
   *
   * const subscription = collection.subscribeChanges((changes) => {
   *   updateUI(changes)
   * }, {
   *   where: (row) => and(eq(row.status, "active"), gt(row.priority, 5))
   * })
   */
  subscribeChanges(callback, options = {}) {
    return this._changes.subscribeChanges(callback, options);
  }
  /**
   * Subscribe to a collection event
   */
  on(event, callback) {
    return this._events.on(event, callback);
  }
  /**
   * Subscribe to a collection event once
   */
  once(event, callback) {
    return this._events.once(event, callback);
  }
  /**
   * Unsubscribe from a collection event
   */
  off(event, callback) {
    this._events.off(event, callback);
  }
  /**
   * Wait for a collection event
   */
  waitFor(event, timeout) {
    return this._events.waitFor(event, timeout);
  }
  /**
   * Clean up the collection by stopping sync and clearing data
   * This can be called manually or automatically by garbage collection
   */
  async cleanup() {
    this._lifecycle.cleanup();
    return Promise.resolve();
  }
}
function buildCompareOptionsFromConfig(config) {
  if (config.defaultStringCollation) {
    const options = config.defaultStringCollation;
    return {
      stringSort: options.stringSort ?? `locale`,
      locale: options.stringSort === `locale` ? options.locale : void 0,
      localeOptions: options.stringSort === `locale` ? options.localeOptions : void 0
    };
  } else {
    return {
      stringSort: `locale`
    };
  }
}
function optimizeQuery(query) {
  const sourceWhereClauses = extractSourceWhereClauses(query);
  let optimized = query;
  let previousOptimized;
  let iterations = 0;
  const maxIterations = 10;
  while (iterations < maxIterations && !deepEquals(optimized, previousOptimized)) {
    previousOptimized = optimized;
    optimized = applyRecursiveOptimization(optimized);
    iterations++;
  }
  const cleaned = removeRedundantSubqueries(optimized);
  return {
    optimizedQuery: cleaned,
    sourceWhereClauses
  };
}
function extractSourceWhereClauses(query) {
  const sourceWhereClauses = /* @__PURE__ */ new Map();
  if (!query.where || query.where.length === 0) {
    return sourceWhereClauses;
  }
  const splitWhereClauses = splitAndClauses(query.where);
  const analyzedClauses = splitWhereClauses.map(
    (clause) => analyzeWhereClause(clause)
  );
  const groupedClauses = groupWhereClauses(analyzedClauses);
  const nullableSources = getNullableJoinSources(query);
  for (const [sourceAlias, whereClause] of groupedClauses.singleSource) {
    if (isCollectionReference(query, sourceAlias) && !nullableSources.has(sourceAlias)) {
      sourceWhereClauses.set(sourceAlias, whereClause);
    }
  }
  return sourceWhereClauses;
}
function isCollectionReference(query, sourceAlias) {
  if (query.from.alias === sourceAlias) {
    return query.from.type === `collectionRef`;
  }
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.alias === sourceAlias) {
        return joinClause.from.type === `collectionRef`;
      }
    }
  }
  return false;
}
function getNullableJoinSources(query) {
  const nullable = /* @__PURE__ */ new Set();
  if (query.join) {
    const mainAlias = query.from.alias;
    for (const join2 of query.join) {
      const joinedAlias = join2.from.alias;
      if (join2.type === `left` || join2.type === `full`) {
        nullable.add(joinedAlias);
      }
      if (join2.type === `right` || join2.type === `full`) {
        nullable.add(mainAlias);
      }
    }
  }
  return nullable;
}
function applyRecursiveOptimization(query) {
  const subqueriesOptimized = {
    ...query,
    from: query.from.type === `queryRef` ? new QueryRef(
      applyRecursiveOptimization(query.from.query),
      query.from.alias
    ) : query.from,
    join: query.join?.map((joinClause) => ({
      ...joinClause,
      from: joinClause.from.type === `queryRef` ? new QueryRef(
        applyRecursiveOptimization(joinClause.from.query),
        joinClause.from.alias
      ) : joinClause.from
    }))
  };
  return applySingleLevelOptimization(subqueriesOptimized);
}
function applySingleLevelOptimization(query) {
  if (!query.where || query.where.length === 0) {
    return query;
  }
  if (!query.join || query.join.length === 0) {
    if (query.where.length > 1) {
      const splitWhereClauses2 = splitAndClauses(query.where);
      const combinedWhere = combineWithAnd(splitWhereClauses2);
      return {
        ...query,
        where: [combinedWhere]
      };
    }
    return query;
  }
  const nonResidualWhereClauses = query.where.filter(
    (where) => !isResidualWhere(where)
  );
  const splitWhereClauses = splitAndClauses(nonResidualWhereClauses);
  const analyzedClauses = splitWhereClauses.map(
    (clause) => analyzeWhereClause(clause)
  );
  const groupedClauses = groupWhereClauses(analyzedClauses);
  const optimizedQuery = applyOptimizations(query, groupedClauses);
  const residualWhereClauses = query.where.filter(
    (where) => isResidualWhere(where)
  );
  if (residualWhereClauses.length > 0) {
    optimizedQuery.where = [
      ...optimizedQuery.where || [],
      ...residualWhereClauses
    ];
  }
  return optimizedQuery;
}
function removeRedundantSubqueries(query) {
  return {
    ...query,
    from: removeRedundantFromClause(query.from),
    join: query.join?.map((joinClause) => ({
      ...joinClause,
      from: removeRedundantFromClause(joinClause.from)
    }))
  };
}
function removeRedundantFromClause(from) {
  if (from.type === `collectionRef`) {
    return from;
  }
  const processedQuery = removeRedundantSubqueries(from.query);
  if (isRedundantSubquery(processedQuery)) {
    const innerFrom = removeRedundantFromClause(processedQuery.from);
    if (innerFrom.type === `collectionRef`) {
      return new CollectionRef(innerFrom.collection, from.alias);
    } else {
      return new QueryRef(innerFrom.query, from.alias);
    }
  }
  return new QueryRef(processedQuery, from.alias);
}
function isRedundantSubquery(query) {
  return (!query.where || query.where.length === 0) && !query.select && (!query.groupBy || query.groupBy.length === 0) && (!query.having || query.having.length === 0) && (!query.orderBy || query.orderBy.length === 0) && (!query.join || query.join.length === 0) && query.limit === void 0 && query.offset === void 0 && !query.fnSelect && (!query.fnWhere || query.fnWhere.length === 0) && (!query.fnHaving || query.fnHaving.length === 0);
}
function splitAndClauses(whereClauses) {
  const result = [];
  for (const whereClause of whereClauses) {
    const clause = getWhereExpression(whereClause);
    result.push(...splitAndClausesRecursive(clause));
  }
  return result;
}
function splitAndClausesRecursive(clause) {
  if (clause.type === `func` && clause.name === `and`) {
    const result = [];
    for (const arg of clause.args) {
      result.push(...splitAndClausesRecursive(arg));
    }
    return result;
  } else {
    return [clause];
  }
}
function analyzeWhereClause(clause) {
  const touchedSources = /* @__PURE__ */ new Set();
  let hasNamespaceOnlyRef = false;
  function collectSources(expr) {
    switch (expr.type) {
      case `ref`:
        if (expr.path && expr.path.length > 0) {
          const firstElement = expr.path[0];
          if (firstElement) {
            touchedSources.add(firstElement);
            if (expr.path.length === 1) {
              hasNamespaceOnlyRef = true;
            }
          }
        }
        break;
      case `func`:
        if (expr.args) {
          expr.args.forEach(collectSources);
        }
        break;
      case `val`:
        break;
      case `agg`:
        if (expr.args) {
          expr.args.forEach(collectSources);
        }
        break;
    }
  }
  collectSources(clause);
  return {
    expression: clause,
    touchedSources,
    hasNamespaceOnlyRef
  };
}
function groupWhereClauses(analyzedClauses) {
  const singleSource = /* @__PURE__ */ new Map();
  const multiSource = [];
  for (const clause of analyzedClauses) {
    if (clause.touchedSources.size === 1 && !clause.hasNamespaceOnlyRef) {
      const source = Array.from(clause.touchedSources)[0];
      if (!singleSource.has(source)) {
        singleSource.set(source, []);
      }
      singleSource.get(source).push(clause.expression);
    } else if (clause.touchedSources.size > 1 || clause.hasNamespaceOnlyRef) {
      multiSource.push(clause.expression);
    }
  }
  const combinedSingleSource = /* @__PURE__ */ new Map();
  for (const [source, clauses] of singleSource) {
    combinedSingleSource.set(source, combineWithAnd(clauses));
  }
  const combinedMultiSource = multiSource.length > 0 ? combineWithAnd(multiSource) : void 0;
  return {
    singleSource: combinedSingleSource,
    multiSource: combinedMultiSource
  };
}
function applyOptimizations(query, groupedClauses) {
  const actuallyOptimized = /* @__PURE__ */ new Set();
  const nullableSources = getNullableJoinSources(query);
  const pushableSingleSource = /* @__PURE__ */ new Map();
  for (const [source, clause] of groupedClauses.singleSource) {
    if (!nullableSources.has(source)) {
      pushableSingleSource.set(source, clause);
    }
  }
  const optimizedFrom = optimizeFromWithTracking(
    query.from,
    pushableSingleSource,
    actuallyOptimized
  );
  const optimizedJoins = query.join ? query.join.map((joinClause) => ({
    ...joinClause,
    from: optimizeFromWithTracking(
      joinClause.from,
      pushableSingleSource,
      actuallyOptimized
    )
  })) : void 0;
  const remainingWhereClauses = [];
  if (groupedClauses.multiSource) {
    remainingWhereClauses.push(groupedClauses.multiSource);
  }
  const hasOuterJoins = nullableSources.size > 0;
  for (const [source, clause] of groupedClauses.singleSource) {
    if (!actuallyOptimized.has(source)) {
      remainingWhereClauses.push(clause);
    } else if (hasOuterJoins) {
      remainingWhereClauses.push(createResidualWhere(clause));
    }
  }
  const finalWhere = remainingWhereClauses.length > 1 ? [
    combineWithAnd(
      remainingWhereClauses.flatMap(
        (clause) => splitAndClausesRecursive(getWhereExpression(clause))
      )
    )
  ] : remainingWhereClauses;
  const optimizedQuery = {
    // Copy all non-optimized fields as-is
    select: query.select,
    groupBy: query.groupBy ? [...query.groupBy] : void 0,
    having: query.having ? [...query.having] : void 0,
    orderBy: query.orderBy ? [...query.orderBy] : void 0,
    limit: query.limit,
    offset: query.offset,
    distinct: query.distinct,
    fnSelect: query.fnSelect,
    fnWhere: query.fnWhere ? [...query.fnWhere] : void 0,
    fnHaving: query.fnHaving ? [...query.fnHaving] : void 0,
    // Use the optimized FROM and JOIN clauses
    from: optimizedFrom,
    join: optimizedJoins,
    // Include combined WHERE clauses
    where: finalWhere.length > 0 ? finalWhere : []
  };
  return optimizedQuery;
}
function deepCopyQuery(query) {
  return {
    // Recursively copy the FROM clause
    from: query.from.type === `collectionRef` ? new CollectionRef(query.from.collection, query.from.alias) : new QueryRef(deepCopyQuery(query.from.query), query.from.alias),
    // Copy all other fields, creating new arrays where necessary
    select: query.select,
    join: query.join ? query.join.map((joinClause) => ({
      type: joinClause.type,
      left: joinClause.left,
      right: joinClause.right,
      from: joinClause.from.type === `collectionRef` ? new CollectionRef(
        joinClause.from.collection,
        joinClause.from.alias
      ) : new QueryRef(
        deepCopyQuery(joinClause.from.query),
        joinClause.from.alias
      )
    })) : void 0,
    where: query.where ? [...query.where] : void 0,
    groupBy: query.groupBy ? [...query.groupBy] : void 0,
    having: query.having ? [...query.having] : void 0,
    orderBy: query.orderBy ? [...query.orderBy] : void 0,
    limit: query.limit,
    offset: query.offset,
    fnSelect: query.fnSelect,
    fnWhere: query.fnWhere ? [...query.fnWhere] : void 0,
    fnHaving: query.fnHaving ? [...query.fnHaving] : void 0
  };
}
function optimizeFromWithTracking(from, singleSourceClauses, actuallyOptimized) {
  const whereClause = singleSourceClauses.get(from.alias);
  if (!whereClause) {
    if (from.type === `collectionRef`) {
      return new CollectionRef(from.collection, from.alias);
    }
    return new QueryRef(deepCopyQuery(from.query), from.alias);
  }
  if (from.type === `collectionRef`) {
    const subQuery = {
      from: new CollectionRef(from.collection, from.alias),
      where: [whereClause]
    };
    actuallyOptimized.add(from.alias);
    return new QueryRef(subQuery, from.alias);
  }
  if (!isSafeToPushIntoExistingSubquery(from.query, whereClause, from.alias)) {
    return new QueryRef(deepCopyQuery(from.query), from.alias);
  }
  if (referencesAliasWithRemappedSelect(from.query, whereClause, from.alias)) {
    return new QueryRef(deepCopyQuery(from.query), from.alias);
  }
  const existingWhere = from.query.where || [];
  const optimizedSubQuery = {
    ...deepCopyQuery(from.query),
    where: [...existingWhere, whereClause]
  };
  actuallyOptimized.add(from.alias);
  return new QueryRef(optimizedSubQuery, from.alias);
}
function unsafeSelect(query, whereClause, outerAlias) {
  if (!query.select) return false;
  return selectHasAggregates(query.select) || whereReferencesComputedSelectFields(query.select, whereClause, outerAlias);
}
function unsafeGroupBy(query) {
  return query.groupBy && query.groupBy.length > 0;
}
function unsafeHaving(query) {
  return query.having && query.having.length > 0;
}
function unsafeOrderBy(query) {
  return query.orderBy && query.orderBy.length > 0 && (query.limit !== void 0 || query.offset !== void 0);
}
function unsafeFnSelect(query) {
  return query.fnSelect || query.fnWhere && query.fnWhere.length > 0 || query.fnHaving && query.fnHaving.length > 0;
}
function isSafeToPushIntoExistingSubquery(query, whereClause, outerAlias) {
  return !(unsafeSelect(query, whereClause, outerAlias) || unsafeGroupBy(query) || unsafeHaving(query) || unsafeOrderBy(query) || unsafeFnSelect(query));
}
function selectHasAggregates(select) {
  for (const value of Object.values(select)) {
    if (typeof value === `object`) {
      const v = value;
      if (v.type === `agg`) return true;
      if (!(`type` in v)) {
        if (selectHasAggregates(v)) return true;
      }
    }
  }
  return false;
}
function collectRefs(expr) {
  const refs = [];
  if (expr == null || typeof expr !== `object`) return refs;
  switch (expr.type) {
    case `ref`:
      refs.push(expr);
      break;
    case `func`:
    case `agg`:
      for (const arg of expr.args ?? []) {
        refs.push(...collectRefs(arg));
      }
      break;
  }
  return refs;
}
function whereReferencesComputedSelectFields(select, whereClause, outerAlias) {
  const computed = /* @__PURE__ */ new Set();
  for (const [key, value] of Object.entries(select)) {
    if (key.startsWith(`__SPREAD_SENTINEL__`)) continue;
    if (value instanceof PropRef) continue;
    computed.add(key);
  }
  const refs = collectRefs(whereClause);
  for (const ref of refs) {
    const path = ref.path;
    if (!Array.isArray(path) || path.length < 2) continue;
    const alias = path[0];
    const field = path[1];
    if (alias !== outerAlias) continue;
    if (computed.has(field)) return true;
  }
  return false;
}
function referencesAliasWithRemappedSelect(subquery, whereClause, outerAlias) {
  const refs = collectRefs(whereClause);
  if (refs.every((ref) => ref.path[0] !== outerAlias)) {
    return false;
  }
  if (subquery.fnSelect) {
    return true;
  }
  const select = subquery.select;
  if (!select) {
    return false;
  }
  for (const ref of refs) {
    const path = ref.path;
    if (path.length < 2) continue;
    if (path[0] !== outerAlias) continue;
    const projected = select[path[1]];
    if (!projected) continue;
    if (!(projected instanceof PropRef)) {
      return true;
    }
    if (projected.path.length < 2) {
      return true;
    }
    const [innerAlias, innerField] = projected.path;
    if (innerAlias !== outerAlias && innerAlias !== subquery.from.alias) {
      return true;
    }
    if (innerField !== path[1]) {
      return true;
    }
  }
  return false;
}
function combineWithAnd(expressions) {
  if (expressions.length === 0) {
    throw new CannotCombineEmptyExpressionListError();
  }
  if (expressions.length === 1) {
    return expressions[0];
  }
  return new Func(`and`, expressions);
}
function processJoins(pipeline, joinClauses, sources, mainCollectionId, mainSource, allInputs, cache, queryMapping, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, rawQuery, onCompileSubquery, aliasToCollectionId, aliasRemapping, sourceWhereClauses) {
  let resultPipeline = pipeline;
  for (const joinClause of joinClauses) {
    resultPipeline = processJoin(
      resultPipeline,
      joinClause,
      sources,
      mainCollectionId,
      mainSource,
      allInputs,
      cache,
      queryMapping,
      collections,
      subscriptions,
      callbacks,
      lazySources,
      optimizableOrderByCollections,
      setWindowFn,
      rawQuery,
      onCompileSubquery,
      aliasToCollectionId,
      aliasRemapping,
      sourceWhereClauses
    );
  }
  return resultPipeline;
}
function processJoin(pipeline, joinClause, sources, mainCollectionId, mainSource, allInputs, cache, queryMapping, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, rawQuery, onCompileSubquery, aliasToCollectionId, aliasRemapping, sourceWhereClauses) {
  const isCollectionRef = joinClause.from.type === `collectionRef`;
  const {
    alias: joinedSource,
    input: joinedInput,
    collectionId: joinedCollectionId
  } = processJoinSource(
    joinClause.from,
    allInputs,
    collections,
    subscriptions,
    callbacks,
    lazySources,
    optimizableOrderByCollections,
    setWindowFn,
    cache,
    queryMapping,
    onCompileSubquery,
    aliasToCollectionId,
    aliasRemapping,
    sourceWhereClauses
  );
  sources[joinedSource] = joinedInput;
  if (isCollectionRef) {
    aliasToCollectionId[joinedSource] = joinedCollectionId;
  }
  const mainCollection = collections[mainCollectionId];
  const joinedCollection = collections[joinedCollectionId];
  if (!mainCollection) {
    throw new JoinCollectionNotFoundError(mainCollectionId);
  }
  if (!joinedCollection) {
    throw new JoinCollectionNotFoundError(joinedCollectionId);
  }
  const { activeSource, lazySource } = getActiveAndLazySources(
    joinClause.type,
    mainCollection,
    joinedCollection
  );
  const availableSources = Object.keys(sources);
  const { mainExpr, joinedExpr } = analyzeJoinExpressions(
    joinClause.left,
    joinClause.right,
    availableSources,
    joinedSource
  );
  const compiledMainExpr = compileExpression(mainExpr);
  const compiledJoinedExpr = compileExpression(joinedExpr);
  let mainPipeline = pipeline.pipe(
    map(([currentKey, namespacedRow]) => {
      const mainKey = normalizeValue(compiledMainExpr(namespacedRow));
      return [mainKey, [currentKey, namespacedRow]];
    })
  );
  let joinedPipeline = joinedInput.pipe(
    map(([currentKey, row]) => {
      const namespacedRow = { [joinedSource]: row };
      const joinedKey = normalizeValue(compiledJoinedExpr(namespacedRow));
      return [joinedKey, [currentKey, namespacedRow]];
    })
  );
  if (![`inner`, `left`, `right`, `full`].includes(joinClause.type)) {
    throw new UnsupportedJoinTypeError(joinClause.type);
  }
  if (activeSource) {
    const lazyFrom = activeSource === `main` ? joinClause.from : rawQuery.from;
    const limitedSubquery = lazyFrom.type === `queryRef` && (lazyFrom.query.limit || lazyFrom.query.offset);
    const hasComputedJoinExpr = mainExpr.type === `func` || joinedExpr.type === `func`;
    if (!limitedSubquery && !hasComputedJoinExpr) {
      const lazyAlias = activeSource === `main` ? joinedSource : mainSource;
      lazySources.add(lazyAlias);
      const activePipeline = activeSource === `main` ? mainPipeline : joinedPipeline;
      const lazySourceJoinExpr = activeSource === `main` ? joinedExpr : mainExpr;
      const followRefResult = followRef(
        rawQuery,
        lazySourceJoinExpr,
        lazySource
      );
      const followRefCollection = followRefResult.collection;
      const fieldName = followRefResult.path[0];
      if (fieldName) {
        ensureIndexForField(
          fieldName,
          followRefResult.path,
          followRefCollection
        );
      }
      const activePipelineWithLoading = activePipeline.pipe(
        tap((data) => {
          const resolvedAlias = aliasRemapping[lazyAlias] || lazyAlias;
          const lazySourceSubscription = subscriptions[resolvedAlias];
          if (!lazySourceSubscription) {
            throw new SubscriptionNotFoundError(
              resolvedAlias,
              lazyAlias,
              lazySource.id,
              Object.keys(subscriptions)
            );
          }
          if (lazySourceSubscription.hasLoadedInitialState()) {
            return;
          }
          const joinKeys = data.getInner().map(([[joinKey]]) => joinKey);
          const lazyJoinRef = new PropRef(followRefResult.path);
          const loaded = lazySourceSubscription.requestSnapshot({
            where: inArray(lazyJoinRef, joinKeys),
            optimizedOnly: true
          });
          if (!loaded) {
            lazySourceSubscription.requestSnapshot();
          }
        })
      );
      if (activeSource === `main`) {
        mainPipeline = activePipelineWithLoading;
      } else {
        joinedPipeline = activePipelineWithLoading;
      }
    }
  }
  return mainPipeline.pipe(
    join(joinedPipeline, joinClause.type),
    processJoinResults(joinClause.type)
  );
}
function analyzeJoinExpressions(left, right, allAvailableSourceAliases, joinedSource) {
  const availableSources = allAvailableSourceAliases.filter(
    (alias) => alias !== joinedSource
  );
  const leftSourceAlias = getSourceAliasFromExpression(left);
  const rightSourceAlias = getSourceAliasFromExpression(right);
  if (leftSourceAlias && availableSources.includes(leftSourceAlias) && rightSourceAlias === joinedSource) {
    return { mainExpr: left, joinedExpr: right };
  }
  if (leftSourceAlias === joinedSource && rightSourceAlias && availableSources.includes(rightSourceAlias)) {
    return { mainExpr: right, joinedExpr: left };
  }
  if (!leftSourceAlias || !rightSourceAlias) {
    throw new InvalidJoinConditionSourceMismatchError();
  }
  if (leftSourceAlias === rightSourceAlias) {
    throw new InvalidJoinConditionSameSourceError(leftSourceAlias);
  }
  if (!availableSources.includes(leftSourceAlias)) {
    throw new InvalidJoinConditionLeftSourceError(leftSourceAlias);
  }
  if (rightSourceAlias !== joinedSource) {
    throw new InvalidJoinConditionRightSourceError(joinedSource);
  }
  throw new InvalidJoinCondition();
}
function getSourceAliasFromExpression(expr) {
  switch (expr.type) {
    case `ref`:
      return expr.path[0] || null;
    case `func`: {
      const sourceAliases = /* @__PURE__ */ new Set();
      for (const arg of expr.args) {
        const alias = getSourceAliasFromExpression(arg);
        if (alias) {
          sourceAliases.add(alias);
        }
      }
      return sourceAliases.size === 1 ? Array.from(sourceAliases)[0] : null;
    }
    default:
      return null;
  }
}
function processJoinSource(from, allInputs, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, cache, queryMapping, onCompileSubquery, aliasToCollectionId, aliasRemapping, sourceWhereClauses) {
  switch (from.type) {
    case `collectionRef`: {
      const input = allInputs[from.alias];
      if (!input) {
        throw new CollectionInputNotFoundError(
          from.alias,
          from.collection.id,
          Object.keys(allInputs)
        );
      }
      aliasToCollectionId[from.alias] = from.collection.id;
      return { alias: from.alias, input, collectionId: from.collection.id };
    }
    case `queryRef`: {
      const originalQuery = queryMapping.get(from.query) || from.query;
      const subQueryResult = onCompileSubquery(
        originalQuery,
        allInputs,
        collections,
        subscriptions,
        callbacks,
        lazySources,
        optimizableOrderByCollections,
        setWindowFn,
        cache,
        queryMapping
      );
      Object.assign(aliasToCollectionId, subQueryResult.aliasToCollectionId);
      Object.assign(aliasRemapping, subQueryResult.aliasRemapping);
      const isUserDefinedSubquery = queryMapping.has(from.query);
      const fromInnerAlias = from.query.from.alias;
      const isOptimizerCreated = !isUserDefinedSubquery && from.alias === fromInnerAlias;
      if (!isOptimizerCreated) {
        for (const [alias, whereClause] of subQueryResult.sourceWhereClauses) {
          sourceWhereClauses.set(alias, whereClause);
        }
      }
      const innerAlias = Object.keys(subQueryResult.aliasToCollectionId).find(
        (alias) => subQueryResult.aliasToCollectionId[alias] === subQueryResult.collectionId
      );
      if (innerAlias && innerAlias !== from.alias) {
        aliasRemapping[from.alias] = innerAlias;
      }
      const subQueryInput = subQueryResult.pipeline;
      const extractedInput = subQueryInput.pipe(
        map((data) => {
          const [key, [value, _orderByIndex]] = data;
          return [key, value];
        })
      );
      return {
        alias: from.alias,
        input: extractedInput,
        collectionId: subQueryResult.collectionId
      };
    }
    default:
      throw new UnsupportedJoinSourceTypeError(from.type);
  }
}
function processJoinResults(joinType) {
  return function(pipeline) {
    return pipeline.pipe(
      // Process the join result and handle nulls
      filter((result) => {
        const [_key, [main, joined]] = result;
        const mainNamespacedRow = main?.[1];
        const joinedNamespacedRow = joined?.[1];
        if (joinType === `inner`) {
          return !!(mainNamespacedRow && joinedNamespacedRow);
        }
        if (joinType === `left`) {
          return !!mainNamespacedRow;
        }
        if (joinType === `right`) {
          return !!joinedNamespacedRow;
        }
        return true;
      }),
      map((result) => {
        const [_key, [main, joined]] = result;
        const mainKey = main?.[0];
        const mainNamespacedRow = main?.[1];
        const joinedKey = joined?.[0];
        const joinedNamespacedRow = joined?.[1];
        const mergedNamespacedRow = {};
        if (mainNamespacedRow) {
          Object.assign(mergedNamespacedRow, mainNamespacedRow);
        }
        if (joinedNamespacedRow) {
          Object.assign(mergedNamespacedRow, joinedNamespacedRow);
        }
        const resultKey = `[${mainKey},${joinedKey}]`;
        return [resultKey, mergedNamespacedRow];
      })
    );
  };
}
function getActiveAndLazySources(joinType, leftCollection, rightCollection) {
  switch (joinType) {
    case `left`:
      return { activeSource: `main`, lazySource: rightCollection };
    case `right`:
      return { activeSource: `joined`, lazySource: leftCollection };
    case `inner`:
      return leftCollection.size < rightCollection.size ? { activeSource: `main`, lazySource: rightCollection } : { activeSource: `joined`, lazySource: leftCollection };
    default:
      return { activeSource: void 0, lazySource: void 0 };
  }
}
function unwrapVal(input) {
  if (input instanceof Value) return input.value;
  return input;
}
function processMerge(op, namespacedRow, selectResults) {
  const value = op.source(namespacedRow);
  if (value && typeof value === `object`) {
    let cursor = selectResults;
    const path = op.targetPath;
    if (path.length === 0) {
      for (const [k, v] of Object.entries(value)) {
        selectResults[k] = unwrapVal(v);
      }
    } else {
      for (let i = 0; i < path.length; i++) {
        const seg = path[i];
        if (i === path.length - 1) {
          const dest = cursor[seg] ??= {};
          if (typeof dest === `object`) {
            for (const [k, v] of Object.entries(value)) {
              dest[k] = unwrapVal(v);
            }
          }
        } else {
          const next = cursor[seg];
          if (next == null || typeof next !== `object`) {
            cursor[seg] = {};
          }
          cursor = cursor[seg];
        }
      }
    }
  }
}
function processNonMergeOp(op, namespacedRow, selectResults) {
  const path = op.alias.split(`.`);
  if (path.length === 1) {
    selectResults[op.alias] = op.compiled(namespacedRow);
  } else {
    let cursor = selectResults;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const next = cursor[seg];
      if (next == null || typeof next !== `object`) {
        cursor[seg] = {};
      }
      cursor = cursor[seg];
    }
    cursor[path[path.length - 1]] = unwrapVal(op.compiled(namespacedRow));
  }
}
function processRow([key, namespacedRow], ops) {
  const selectResults = {};
  for (const op of ops) {
    if (op.kind === `merge`) {
      processMerge(op, namespacedRow, selectResults);
    } else {
      processNonMergeOp(op, namespacedRow, selectResults);
    }
  }
  return [
    key,
    {
      ...namespacedRow,
      $selected: selectResults
    }
  ];
}
function processSelect(pipeline, select, _allInputs) {
  const ops = [];
  addFromObject([], select, ops);
  return pipeline.pipe(map((row) => processRow(row, ops)));
}
function isAggregateExpression(expr) {
  return expr.type === `agg`;
}
function isNestedSelectObject(obj) {
  return obj && typeof obj === `object` && !isExpressionLike(obj);
}
function addFromObject(prefixPath, obj, ops) {
  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith(`__SPREAD_SENTINEL__`)) {
      const rest = key.slice(`__SPREAD_SENTINEL__`.length);
      const splitIndex = rest.lastIndexOf(`__`);
      const pathStr = splitIndex >= 0 ? rest.slice(0, splitIndex) : rest;
      const isRefExpr = value && typeof value === `object` && `type` in value && value.type === `ref`;
      if (pathStr.includes(`.`) || isRefExpr) {
        const targetPath = [...prefixPath];
        const expr = isRefExpr ? value : new PropRef(pathStr.split(`.`));
        const compiled = compileExpression(expr);
        ops.push({ kind: `merge`, targetPath, source: compiled });
      } else {
        const tableAlias = pathStr;
        const targetPath = [...prefixPath];
        ops.push({
          kind: `merge`,
          targetPath,
          source: (row) => row[tableAlias]
        });
      }
      continue;
    }
    const expression = value;
    if (isNestedSelectObject(expression)) {
      addFromObject([...prefixPath, key], expression, ops);
      continue;
    }
    if (isAggregateExpression(expression) || containsAggregate(expression)) {
      ops.push({
        kind: `field`,
        alias: [...prefixPath, key].join(`.`),
        compiled: () => null
      });
    } else {
      if (expression === void 0 || !isExpressionLike(expression)) {
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: () => expression
        });
        continue;
      }
      if (expression instanceof Value) {
        const val = expression.value;
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: () => val
        });
      } else {
        ops.push({
          kind: `field`,
          alias: [...prefixPath, key].join(`.`),
          compiled: compileExpression(expression)
        });
      }
    }
  }
}
function compileQuery(rawQuery, inputs, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, cache = /* @__PURE__ */ new WeakMap(), queryMapping = /* @__PURE__ */ new WeakMap()) {
  const cachedResult = cache.get(rawQuery);
  if (cachedResult) {
    return cachedResult;
  }
  validateQueryStructure(rawQuery);
  const { optimizedQuery: query, sourceWhereClauses } = optimizeQuery(rawQuery);
  queryMapping.set(query, rawQuery);
  mapNestedQueries(query, rawQuery, queryMapping);
  const allInputs = { ...inputs };
  const aliasToCollectionId = {};
  const aliasRemapping = {};
  const sources = {};
  const {
    alias: mainSource,
    input: mainInput,
    collectionId: mainCollectionId
  } = processFrom(
    query.from,
    allInputs,
    collections,
    subscriptions,
    callbacks,
    lazySources,
    optimizableOrderByCollections,
    setWindowFn,
    cache,
    queryMapping,
    aliasToCollectionId,
    aliasRemapping,
    sourceWhereClauses
  );
  sources[mainSource] = mainInput;
  let pipeline = mainInput.pipe(
    map(([key, row]) => {
      const ret = [key, { [mainSource]: row }];
      return ret;
    })
  );
  if (query.join && query.join.length > 0) {
    pipeline = processJoins(
      pipeline,
      query.join,
      sources,
      mainCollectionId,
      mainSource,
      allInputs,
      cache,
      queryMapping,
      collections,
      subscriptions,
      callbacks,
      lazySources,
      optimizableOrderByCollections,
      setWindowFn,
      rawQuery,
      compileQuery,
      aliasToCollectionId,
      aliasRemapping,
      sourceWhereClauses
    );
  }
  if (query.where && query.where.length > 0) {
    for (const where of query.where) {
      const whereExpression = getWhereExpression(where);
      const compiledWhere = compileExpression(whereExpression);
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return toBooleanPredicate(compiledWhere(namespacedRow));
        })
      );
    }
  }
  if (query.fnWhere && query.fnWhere.length > 0) {
    for (const fnWhere of query.fnWhere) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return toBooleanPredicate(fnWhere(namespacedRow));
        })
      );
    }
  }
  if (query.distinct && !query.fnSelect && !query.select) {
    throw new DistinctRequiresSelectError();
  }
  if (query.fnSelect && query.groupBy && query.groupBy.length > 0) {
    throw new FnSelectWithGroupByError();
  }
  if (query.fnSelect) {
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults = query.fnSelect(namespacedRow);
        return [
          key,
          {
            ...namespacedRow,
            $selected: selectResults
          }
        ];
      })
    );
  } else if (query.select) {
    pipeline = processSelect(pipeline, query.select);
  } else {
    pipeline = pipeline.pipe(
      map(([key, namespacedRow]) => {
        const selectResults = !query.join && !query.groupBy ? namespacedRow[mainSource] : namespacedRow;
        return [
          key,
          {
            ...namespacedRow,
            $selected: selectResults
          }
        ];
      })
    );
  }
  if (query.groupBy && query.groupBy.length > 0) {
    pipeline = processGroupBy(
      pipeline,
      query.groupBy,
      query.having,
      query.select,
      query.fnHaving
    );
  } else if (query.select) {
    const hasAggregates = Object.values(query.select).some(
      (expr) => expr.type === `agg` || containsAggregate(expr)
    );
    if (hasAggregates) {
      pipeline = processGroupBy(
        pipeline,
        [],
        // Empty group by means single group
        query.having,
        query.select,
        query.fnHaving
      );
    }
  }
  if (query.having && (!query.groupBy || query.groupBy.length === 0)) {
    const hasAggregates = query.select ? Object.values(query.select).some((expr) => expr.type === `agg`) : false;
    if (!hasAggregates) {
      throw new HavingRequiresGroupByError();
    }
  }
  if (query.fnHaving && query.fnHaving.length > 0 && (!query.groupBy || query.groupBy.length === 0)) {
    for (const fnHaving of query.fnHaving) {
      pipeline = pipeline.pipe(
        filter(([_key, namespacedRow]) => {
          return fnHaving(namespacedRow);
        })
      );
    }
  }
  if (query.distinct) {
    pipeline = pipeline.pipe(distinct(([_key, row]) => row.$selected));
  }
  if (query.orderBy && query.orderBy.length > 0) {
    const orderedPipeline = processOrderBy(
      rawQuery,
      pipeline,
      query.orderBy,
      query.select || {},
      collections[mainCollectionId],
      optimizableOrderByCollections,
      setWindowFn,
      query.limit,
      query.offset
    );
    const resultPipeline2 = orderedPipeline.pipe(
      map(([key, [row, orderByIndex]]) => {
        const raw = row.$selected;
        const finalResults = unwrapValue(raw);
        return [key, [finalResults, orderByIndex]];
      })
    );
    const result2 = resultPipeline2;
    const compilationResult2 = {
      collectionId: mainCollectionId,
      pipeline: result2,
      sourceWhereClauses,
      aliasToCollectionId,
      aliasRemapping
    };
    cache.set(rawQuery, compilationResult2);
    return compilationResult2;
  } else if (query.limit !== void 0 || query.offset !== void 0) {
    throw new LimitOffsetRequireOrderByError();
  }
  const resultPipeline = pipeline.pipe(
    map(([key, row]) => {
      const raw = row.$selected;
      const finalResults = unwrapValue(raw);
      return [key, [finalResults, void 0]];
    })
  );
  const result = resultPipeline;
  const compilationResult = {
    collectionId: mainCollectionId,
    pipeline: result,
    sourceWhereClauses,
    aliasToCollectionId,
    aliasRemapping
  };
  cache.set(rawQuery, compilationResult);
  return compilationResult;
}
function collectDirectCollectionAliases(query) {
  const aliases = /* @__PURE__ */ new Set();
  if (query.from.type === `collectionRef`) {
    aliases.add(query.from.alias);
  }
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.type === `collectionRef`) {
        aliases.add(joinClause.from.alias);
      }
    }
  }
  return aliases;
}
function validateQueryStructure(query, parentCollectionAliases = /* @__PURE__ */ new Set()) {
  const currentLevelAliases = collectDirectCollectionAliases(query);
  for (const alias of currentLevelAliases) {
    if (parentCollectionAliases.has(alias)) {
      throw new DuplicateAliasInSubqueryError(
        alias,
        Array.from(parentCollectionAliases)
      );
    }
  }
  const combinedAliases = /* @__PURE__ */ new Set([
    ...parentCollectionAliases,
    ...currentLevelAliases
  ]);
  if (query.from.type === `queryRef`) {
    validateQueryStructure(query.from.query, combinedAliases);
  }
  if (query.join) {
    for (const joinClause of query.join) {
      if (joinClause.from.type === `queryRef`) {
        validateQueryStructure(joinClause.from.query, combinedAliases);
      }
    }
  }
}
function processFrom(from, allInputs, collections, subscriptions, callbacks, lazySources, optimizableOrderByCollections, setWindowFn, cache, queryMapping, aliasToCollectionId, aliasRemapping, sourceWhereClauses) {
  switch (from.type) {
    case `collectionRef`: {
      const input = allInputs[from.alias];
      if (!input) {
        throw new CollectionInputNotFoundError(
          from.alias,
          from.collection.id,
          Object.keys(allInputs)
        );
      }
      aliasToCollectionId[from.alias] = from.collection.id;
      return { alias: from.alias, input, collectionId: from.collection.id };
    }
    case `queryRef`: {
      const originalQuery = queryMapping.get(from.query) || from.query;
      const subQueryResult = compileQuery(
        originalQuery,
        allInputs,
        collections,
        subscriptions,
        callbacks,
        lazySources,
        optimizableOrderByCollections,
        setWindowFn,
        cache,
        queryMapping
      );
      Object.assign(aliasToCollectionId, subQueryResult.aliasToCollectionId);
      Object.assign(aliasRemapping, subQueryResult.aliasRemapping);
      const isUserDefinedSubquery = queryMapping.has(from.query);
      const subqueryFromAlias = from.query.from.alias;
      const isOptimizerCreated = !isUserDefinedSubquery && from.alias === subqueryFromAlias;
      if (!isOptimizerCreated) {
        for (const [alias, whereClause] of subQueryResult.sourceWhereClauses) {
          sourceWhereClauses.set(alias, whereClause);
        }
      }
      const innerAlias = Object.keys(subQueryResult.aliasToCollectionId).find(
        (alias) => subQueryResult.aliasToCollectionId[alias] === subQueryResult.collectionId
      );
      if (innerAlias && innerAlias !== from.alias) {
        aliasRemapping[from.alias] = innerAlias;
      }
      const subQueryInput = subQueryResult.pipeline;
      const extractedInput = subQueryInput.pipe(
        map((data) => {
          const [key, [value, _orderByIndex]] = data;
          const unwrapped = unwrapValue(value);
          return [key, unwrapped];
        })
      );
      return {
        alias: from.alias,
        input: extractedInput,
        collectionId: subQueryResult.collectionId
      };
    }
    default:
      throw new UnsupportedFromTypeError(from.type);
  }
}
function isValue(raw) {
  return raw instanceof Value || raw && typeof raw === `object` && `type` in raw && raw.type === `val`;
}
function unwrapValue(value) {
  return isValue(value) ? value.value : value;
}
function mapNestedQueries(optimizedQuery, originalQuery, queryMapping) {
  if (optimizedQuery.from.type === `queryRef` && originalQuery.from.type === `queryRef`) {
    queryMapping.set(optimizedQuery.from.query, originalQuery.from.query);
    mapNestedQueries(
      optimizedQuery.from.query,
      originalQuery.from.query,
      queryMapping
    );
  }
  if (optimizedQuery.join && originalQuery.join) {
    for (let i = 0; i < optimizedQuery.join.length && i < originalQuery.join.length; i++) {
      const optimizedJoin = optimizedQuery.join[i];
      const originalJoin = originalQuery.join[i];
      if (optimizedJoin.from.type === `queryRef` && originalJoin.from.type === `queryRef`) {
        queryMapping.set(optimizedJoin.from.query, originalJoin.from.query);
        mapNestedQueries(
          optimizedJoin.from.query,
          originalJoin.from.query,
          queryMapping
        );
      }
    }
  }
}
function normalizeExpressionPaths(whereClause, collectionAlias) {
  const tpe = whereClause.type;
  if (tpe === `val`) {
    return new Value(whereClause.value);
  } else if (tpe === `ref`) {
    const path = whereClause.path;
    if (Array.isArray(path)) {
      if (path[0] === collectionAlias && path.length > 1) {
        return new PropRef(path.slice(1));
      } else if (path.length === 1 && path[0] !== void 0) {
        return new PropRef([path[0]]);
      }
    }
    return new PropRef(Array.isArray(path) ? path : [String(path)]);
  } else {
    const args = [];
    for (const arg of whereClause.args) {
      const convertedArg = normalizeExpressionPaths(
        arg,
        collectionAlias
      );
      args.push(convertedArg);
    }
    return new Func(whereClause.name, args);
  }
}
function normalizeOrderByPaths(orderBy, collectionAlias) {
  const normalizedOrderBy = orderBy.map((clause) => {
    const basicExp = normalizeExpressionPaths(
      clause.expression,
      collectionAlias
    );
    return {
      ...clause,
      expression: basicExp
    };
  });
  return normalizedOrderBy;
}
const collectionBuilderRegistry = /* @__PURE__ */ new WeakMap();
function getBuilderFromConfig(config) {
  return config.utils?.[LIVE_QUERY_INTERNAL]?.getBuilder?.();
}
function registerCollectionBuilder(collection, builder) {
  collectionBuilderRegistry.set(collection, builder);
}
function getCollectionBuilder(collection) {
  return collectionBuilderRegistry.get(collection);
}
class BaseQueryBuilder {
  constructor(query = {}) {
    this.query = {};
    this.query = { ...query };
  }
  /**
   * Creates a CollectionRef or QueryRef from a source object
   * @param source - An object with a single key-value pair
   * @param context - Context string for error messages (e.g., "from clause", "join clause")
   * @returns A tuple of [alias, ref] where alias is the source key and ref is the created reference
   */
  _createRefForSource(source, context) {
    let keys;
    try {
      keys = Object.keys(source);
    } catch {
      const type = source === null ? `null` : `undefined`;
      throw new InvalidSourceTypeError(context, type);
    }
    if (Array.isArray(source)) {
      throw new InvalidSourceTypeError(context, `array`);
    }
    if (keys.length !== 1) {
      if (keys.length === 0) {
        throw new InvalidSourceTypeError(context, `empty object`);
      }
      if (keys.every((k) => !isNaN(Number(k)))) {
        throw new InvalidSourceTypeError(context, `string`);
      }
      throw new OnlyOneSourceAllowedError(context);
    }
    const alias = keys[0];
    const sourceValue = source[alias];
    let ref;
    if (sourceValue instanceof CollectionImpl) {
      ref = new CollectionRef(sourceValue, alias);
    } else if (sourceValue instanceof BaseQueryBuilder) {
      const subQuery = sourceValue._getQuery();
      if (!subQuery.from) {
        throw new SubQueryMustHaveFromClauseError(context);
      }
      ref = new QueryRef(subQuery, alias);
    } else {
      throw new InvalidSourceError(alias);
    }
    return [alias, ref];
  }
  /**
   * Specify the source table or subquery for the query
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @returns A QueryBuilder with the specified source
   *
   * @example
   * ```ts
   * // Query from a collection
   * query.from({ users: usersCollection })
   *
   * // Query from a subquery
   * const activeUsers = query.from({ u: usersCollection }).where(({u}) => u.active)
   * query.from({ activeUsers })
   * ```
   */
  from(source) {
    const [, from] = this._createRefForSource(source, `from clause`);
    return new BaseQueryBuilder({
      ...this.query,
      from
    });
  }
  /**
   * Join another table or subquery to the current query
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @param onCallback - A function that receives table references and returns the join condition
   * @param type - The type of join: 'inner', 'left', 'right', or 'full' (defaults to 'left')
   * @returns A QueryBuilder with the joined table available
   *
   * @example
   * ```ts
   * // Left join users with posts
   * query
   *   .from({ users: usersCollection })
   *   .join({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
   *
   * // Inner join with explicit type
   * query
   *   .from({ u: usersCollection })
   *   .join({ p: postsCollection }, ({u, p}) => eq(u.id, p.userId), 'inner')
   * ```
   *
   * // Join with a subquery
   * const activeUsers = query.from({ u: usersCollection }).where(({u}) => u.active)
   * query
   *   .from({ activeUsers })
   *   .join({ p: postsCollection }, ({u, p}) => eq(u.id, p.userId))
   */
  join(source, onCallback, type = `left`) {
    const [alias, from] = this._createRefForSource(source, `join clause`);
    const currentAliases = this._getCurrentAliases();
    const newAliases = [...currentAliases, alias];
    const refProxy = createRefProxy(newAliases);
    const onExpression = onCallback(refProxy);
    let left;
    let right;
    if (onExpression.type === `func` && onExpression.name === `eq` && onExpression.args.length === 2) {
      left = onExpression.args[0];
      right = onExpression.args[1];
    } else {
      throw new JoinConditionMustBeEqualityError();
    }
    const joinClause = {
      from,
      type,
      left,
      right
    };
    const existingJoins = this.query.join || [];
    return new BaseQueryBuilder({
      ...this.query,
      join: [...existingJoins, joinClause]
    });
  }
  /**
   * Perform a LEFT JOIN with another table or subquery
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @param onCallback - A function that receives table references and returns the join condition
   * @returns A QueryBuilder with the left joined table available
   *
   * @example
   * ```ts
   * // Left join users with posts
   * query
   *   .from({ users: usersCollection })
   *   .leftJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
   * ```
   */
  leftJoin(source, onCallback) {
    return this.join(source, onCallback, `left`);
  }
  /**
   * Perform a RIGHT JOIN with another table or subquery
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @param onCallback - A function that receives table references and returns the join condition
   * @returns A QueryBuilder with the right joined table available
   *
   * @example
   * ```ts
   * // Right join users with posts
   * query
   *   .from({ users: usersCollection })
   *   .rightJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
   * ```
   */
  rightJoin(source, onCallback) {
    return this.join(source, onCallback, `right`);
  }
  /**
   * Perform an INNER JOIN with another table or subquery
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @param onCallback - A function that receives table references and returns the join condition
   * @returns A QueryBuilder with the inner joined table available
   *
   * @example
   * ```ts
   * // Inner join users with posts
   * query
   *   .from({ users: usersCollection })
   *   .innerJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
   * ```
   */
  innerJoin(source, onCallback) {
    return this.join(source, onCallback, `inner`);
  }
  /**
   * Perform a FULL JOIN with another table or subquery
   *
   * @param source - An object with a single key-value pair where the key is the table alias and the value is a Collection or subquery
   * @param onCallback - A function that receives table references and returns the join condition
   * @returns A QueryBuilder with the full joined table available
   *
   * @example
   * ```ts
   * // Full join users with posts
   * query
   *   .from({ users: usersCollection })
   *   .fullJoin({ posts: postsCollection }, ({users, posts}) => eq(users.id, posts.userId))
   * ```
   */
  fullJoin(source, onCallback) {
    return this.join(source, onCallback, `full`);
  }
  /**
   * Filter rows based on a condition
   *
   * @param callback - A function that receives table references and returns an expression
   * @returns A QueryBuilder with the where condition applied
   *
   * @example
   * ```ts
   * // Simple condition
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => gt(users.age, 18))
   *
   * // Multiple conditions
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => and(
   *     gt(users.age, 18),
   *     eq(users.active, true)
   *   ))
   *
   * // Multiple where calls are ANDed together
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => gt(users.age, 18))
   *   .where(({users}) => eq(users.active, true))
   * ```
   */
  where(callback) {
    const aliases = this._getCurrentAliases();
    const refProxy = createRefProxy(aliases);
    const rawExpression = callback(refProxy);
    const expression = isRefProxy(rawExpression) ? toExpression(rawExpression) : rawExpression;
    if (!isExpressionLike(expression)) {
      throw new InvalidWhereExpressionError(getValueTypeName(expression));
    }
    const existingWhere = this.query.where || [];
    return new BaseQueryBuilder({
      ...this.query,
      where: [...existingWhere, expression]
    });
  }
  /**
   * Filter grouped rows based on aggregate conditions
   *
   * @param callback - A function that receives table references and returns an expression
   * @returns A QueryBuilder with the having condition applied
   *
   * @example
   * ```ts
   * // Filter groups by count
   * query
   *   .from({ posts: postsCollection })
   *   .groupBy(({posts}) => posts.userId)
   *   .having(({posts}) => gt(count(posts.id), 5))
   *
   * // Filter by average
   * query
   *   .from({ orders: ordersCollection })
   *   .groupBy(({orders}) => orders.customerId)
   *   .having(({orders}) => gt(avg(orders.total), 100))
   *
   * // Multiple having calls are ANDed together
   * query
   *   .from({ orders: ordersCollection })
   *   .groupBy(({orders}) => orders.customerId)
   *   .having(({orders}) => gt(count(orders.id), 5))
   *   .having(({orders}) => gt(avg(orders.total), 100))
   * ```
   */
  having(callback) {
    const aliases = this._getCurrentAliases();
    const refProxy = this.query.select || this.query.fnSelect ? createRefProxyWithSelected(aliases) : createRefProxy(aliases);
    const rawExpression = callback(refProxy);
    const expression = isRefProxy(rawExpression) ? toExpression(rawExpression) : rawExpression;
    if (!isExpressionLike(expression)) {
      throw new InvalidWhereExpressionError(getValueTypeName(expression));
    }
    const existingHaving = this.query.having || [];
    return new BaseQueryBuilder({
      ...this.query,
      having: [...existingHaving, expression]
    });
  }
  /**
   * Select specific columns or computed values from the query
   *
   * @param callback - A function that receives table references and returns an object with selected fields or expressions
   * @returns A QueryBuilder that returns only the selected fields
   *
   * @example
   * ```ts
   * // Select specific columns
   * query
   *   .from({ users: usersCollection })
   *   .select(({users}) => ({
   *     name: users.name,
   *     email: users.email
   *   }))
   *
   * // Select with computed values
   * query
   *   .from({ users: usersCollection })
   *   .select(({users}) => ({
   *     fullName: concat(users.firstName, ' ', users.lastName),
   *     ageInMonths: mul(users.age, 12)
   *   }))
   *
   * // Select with aggregates (requires GROUP BY)
   * query
   *   .from({ posts: postsCollection })
   *   .groupBy(({posts}) => posts.userId)
   *   .select(({posts, count}) => ({
   *     userId: posts.userId,
   *     postCount: count(posts.id)
   *   }))
   * ```
   */
  select(callback) {
    const aliases = this._getCurrentAliases();
    const refProxy = createRefProxy(aliases);
    const selectObject = callback(refProxy);
    const select = buildNestedSelect(selectObject);
    return new BaseQueryBuilder({
      ...this.query,
      select,
      fnSelect: void 0
      // remove the fnSelect clause if it exists
    });
  }
  /**
   * Sort the query results by one or more columns
   *
   * @param callback - A function that receives table references and returns the field to sort by
   * @param direction - Sort direction: 'asc' for ascending, 'desc' for descending (defaults to 'asc')
   * @returns A QueryBuilder with the ordering applied
   *
   * @example
   * ```ts
   * // Sort by a single column
   * query
   *   .from({ users: usersCollection })
   *   .orderBy(({users}) => users.name)
   *
   * // Sort descending
   * query
   *   .from({ users: usersCollection })
   *   .orderBy(({users}) => users.createdAt, 'desc')
   *
   * // Multiple sorts (chain orderBy calls)
   * query
   *   .from({ users: usersCollection })
   *   .orderBy(({users}) => users.lastName)
   *   .orderBy(({users}) => users.firstName)
   * ```
   */
  orderBy(callback, options = `asc`) {
    const aliases = this._getCurrentAliases();
    const refProxy = this.query.select || this.query.fnSelect ? createRefProxyWithSelected(aliases) : createRefProxy(aliases);
    const result = callback(refProxy);
    const opts = typeof options === `string` ? { direction: options, nulls: `first` } : {
      direction: options.direction ?? `asc`,
      nulls: options.nulls ?? `first`,
      stringSort: options.stringSort,
      locale: options.stringSort === `locale` ? options.locale : void 0,
      localeOptions: options.stringSort === `locale` ? options.localeOptions : void 0
    };
    const makeOrderByClause = (res) => {
      return {
        expression: toExpression(res),
        compareOptions: opts
      };
    };
    const orderByClauses = Array.isArray(result) ? result.map((r) => makeOrderByClause(r)) : [makeOrderByClause(result)];
    const existingOrderBy = this.query.orderBy || [];
    return new BaseQueryBuilder({
      ...this.query,
      orderBy: [...existingOrderBy, ...orderByClauses]
    });
  }
  /**
   * Group rows by one or more columns for aggregation
   *
   * @param callback - A function that receives table references and returns the field(s) to group by
   * @returns A QueryBuilder with grouping applied (enables aggregate functions in SELECT and HAVING)
   *
   * @example
   * ```ts
   * // Group by a single column
   * query
   *   .from({ posts: postsCollection })
   *   .groupBy(({posts}) => posts.userId)
   *   .select(({posts, count}) => ({
   *     userId: posts.userId,
   *     postCount: count()
   *   }))
   *
   * // Group by multiple columns
   * query
   *   .from({ sales: salesCollection })
   *   .groupBy(({sales}) => [sales.region, sales.category])
   *   .select(({sales, sum}) => ({
   *     region: sales.region,
   *     category: sales.category,
   *     totalSales: sum(sales.amount)
   *   }))
   * ```
   */
  groupBy(callback) {
    const aliases = this._getCurrentAliases();
    const refProxy = createRefProxy(aliases);
    const result = callback(refProxy);
    const newExpressions = Array.isArray(result) ? result.map((r) => toExpression(r)) : [toExpression(result)];
    const existingGroupBy = this.query.groupBy || [];
    return new BaseQueryBuilder({
      ...this.query,
      groupBy: [...existingGroupBy, ...newExpressions]
    });
  }
  /**
   * Limit the number of rows returned by the query
   * `orderBy` is required for `limit`
   *
   * @param count - Maximum number of rows to return
   * @returns A QueryBuilder with the limit applied
   *
   * @example
   * ```ts
   * // Get top 5 posts by likes
   * query
   *   .from({ posts: postsCollection })
   *   .orderBy(({posts}) => posts.likes, 'desc')
   *   .limit(5)
   * ```
   */
  limit(count2) {
    return new BaseQueryBuilder({
      ...this.query,
      limit: count2
    });
  }
  /**
   * Skip a number of rows before returning results
   * `orderBy` is required for `offset`
   *
   * @param count - Number of rows to skip
   * @returns A QueryBuilder with the offset applied
   *
   * @example
   * ```ts
   * // Get second page of results
   * query
   *   .from({ posts: postsCollection })
   *   .orderBy(({posts}) => posts.createdAt, 'desc')
   *   .offset(page * pageSize)
   *   .limit(pageSize)
   * ```
   */
  offset(count2) {
    return new BaseQueryBuilder({
      ...this.query,
      offset: count2
    });
  }
  /**
   * Specify that the query should return distinct rows.
   * Deduplicates rows based on the selected columns.
   * @returns A QueryBuilder with distinct enabled
   *
   * @example
   * ```ts
   * // Get countries our users are from
   * query
   *   .from({ users: usersCollection })
   *   .select(({users}) => users.country)
   *   .distinct()
   * ```
   */
  distinct() {
    return new BaseQueryBuilder({
      ...this.query,
      distinct: true
    });
  }
  /**
   * Specify that the query should return a single result
   * @returns A QueryBuilder that returns the first result
   *
   * @example
   * ```ts
   * // Get the user matching the query
   * query
   *   .from({ users: usersCollection })
   *   .where(({users}) => eq(users.id, 1))
   *   .findOne()
   *```
   */
  findOne() {
    return new BaseQueryBuilder({
      ...this.query,
      // TODO: enforcing return only one result with also a default orderBy if none is specified
      // limit: 1,
      singleResult: true
    });
  }
  // Helper methods
  _getCurrentAliases() {
    const aliases = [];
    if (this.query.from) {
      aliases.push(this.query.from.alias);
    }
    if (this.query.join) {
      for (const join2 of this.query.join) {
        aliases.push(join2.from.alias);
      }
    }
    return aliases;
  }
  /**
   * Functional variants of the query builder
   * These are imperative function that are called for ery row.
   * Warning: that these cannot be optimized by the query compiler, and may prevent
   * some type of optimizations being possible.
   * @example
   * ```ts
   * q.fn.select((row) => ({
   *   name: row.user.name.toUpperCase(),
   *   age: row.user.age + 1,
   * }))
   * ```
   */
  get fn() {
    const builder = this;
    return {
      /**
       * Select fields using a function that operates on each row
       * Warning: This cannot be optimized by the query compiler
       *
       * @param callback - A function that receives a row and returns the selected value
       * @returns A QueryBuilder with functional selection applied
       *
       * @example
       * ```ts
       * // Functional select (not optimized)
       * query
       *   .from({ users: usersCollection })
       *   .fn.select(row => ({
       *     name: row.users.name.toUpperCase(),
       *     age: row.users.age + 1,
       *   }))
       * ```
       */
      select(callback) {
        return new BaseQueryBuilder({
          ...builder.query,
          select: void 0,
          // remove the select clause if it exists
          fnSelect: callback
        });
      },
      /**
       * Filter rows using a function that operates on each row
       * Warning: This cannot be optimized by the query compiler
       *
       * @param callback - A function that receives a row and returns a boolean
       * @returns A QueryBuilder with functional filtering applied
       *
       * @example
       * ```ts
       * // Functional where (not optimized)
       * query
       *   .from({ users: usersCollection })
       *   .fn.where(row => row.users.name.startsWith('A'))
       * ```
       */
      where(callback) {
        return new BaseQueryBuilder({
          ...builder.query,
          fnWhere: [
            ...builder.query.fnWhere || [],
            callback
          ]
        });
      },
      /**
       * Filter grouped rows using a function that operates on each aggregated row
       * Warning: This cannot be optimized by the query compiler
       *
       * @param callback - A function that receives an aggregated row (with $selected when select() was called) and returns a boolean
       * @returns A QueryBuilder with functional having filter applied
       *
       * @example
       * ```ts
       * // Functional having (not optimized)
       * query
       *   .from({ posts: postsCollection })
       *   .groupBy(({posts}) => posts.userId)
       *   .select(({posts}) => ({ userId: posts.userId, count: count(posts.id) }))
       *   .fn.having(({ $selected }) => $selected.count > 5)
       * ```
       */
      having(callback) {
        return new BaseQueryBuilder({
          ...builder.query,
          fnHaving: [
            ...builder.query.fnHaving || [],
            callback
          ]
        });
      }
    };
  }
  _getQuery() {
    if (!this.query.from) {
      throw new QueryMustHaveFromClauseError();
    }
    return this.query;
  }
}
function getValueTypeName(value) {
  if (value === null) return `null`;
  if (value === void 0) return `undefined`;
  if (typeof value === `object`) return `object`;
  return typeof value;
}
function toExpr(value) {
  if (value === void 0) return toExpression(null);
  if (value instanceof Aggregate || value instanceof Func || value instanceof PropRef || value instanceof Value) {
    return value;
  }
  return toExpression(value);
}
function isPlainObject(value) {
  return value !== null && typeof value === `object` && !isExpressionLike(value) && !value.__refProxy;
}
function buildNestedSelect(obj) {
  if (!isPlainObject(obj)) return toExpr(obj);
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (typeof k === `string` && k.startsWith(`__SPREAD_SENTINEL__`)) {
      out[k] = v;
      continue;
    }
    out[k] = buildNestedSelect(v);
  }
  return out;
}
function buildQuery(fn) {
  const result = fn(new BaseQueryBuilder());
  return getQueryIR(result);
}
function getQueryIR(builder) {
  return builder._getQuery();
}
function extractCollectionsFromQuery(query) {
  const collections = {};
  function extractFromSource(source) {
    if (source.type === `collectionRef`) {
      collections[source.collection.id] = source.collection;
    } else if (source.type === `queryRef`) {
      extractFromQuery(source.query);
    }
  }
  function extractFromQuery(q) {
    if (q.from) {
      extractFromSource(q.from);
    }
    if (q.join && Array.isArray(q.join)) {
      for (const joinClause of q.join) {
        if (joinClause.from) {
          extractFromSource(joinClause.from);
        }
      }
    }
  }
  extractFromQuery(query);
  return collections;
}
function extractCollectionFromSource(query) {
  const from = query.from;
  if (from.type === `collectionRef`) {
    return from.collection;
  } else if (from.type === `queryRef`) {
    return extractCollectionFromSource(from.query);
  }
  throw new Error(
    `Failed to extract collection. Invalid FROM clause: ${JSON.stringify(query)}`
  );
}
function extractCollectionAliases(query) {
  const aliasesById = /* @__PURE__ */ new Map();
  function recordAlias(source) {
    if (!source) return;
    if (source.type === `collectionRef`) {
      const { id } = source.collection;
      const existing = aliasesById.get(id);
      if (existing) {
        existing.add(source.alias);
      } else {
        aliasesById.set(id, /* @__PURE__ */ new Set([source.alias]));
      }
    } else if (source.type === `queryRef`) {
      traverse(source.query);
    }
  }
  function traverse(q) {
    if (!q) return;
    recordAlias(q.from);
    if (q.join) {
      for (const joinClause of q.join) {
        recordAlias(joinClause.from);
      }
    }
  }
  traverse(query);
  return aliasesById;
}
function buildQueryFromConfig(config) {
  if (typeof config.query === `function`) {
    return buildQuery(config.query);
  }
  return getQueryIR(config.query);
}
function sendChangesToInput(input, changes, getKey) {
  const multiSetArray = [];
  for (const change of changes) {
    const key = getKey(change.value);
    if (change.type === `insert`) {
      multiSetArray.push([[key, change.value], 1]);
    } else if (change.type === `update`) {
      multiSetArray.push([[key, change.previousValue], -1]);
      multiSetArray.push([[key, change.value], 1]);
    } else {
      multiSetArray.push([[key, change.value], -1]);
    }
  }
  if (multiSetArray.length !== 0) {
    input.sendData(new MultiSet(multiSetArray));
  }
  return multiSetArray.length;
}
function* splitUpdates(changes) {
  for (const change of changes) {
    if (change.type === `update`) {
      yield { type: `delete`, key: change.key, value: change.previousValue };
      yield { type: `insert`, key: change.key, value: change.value };
    } else {
      yield change;
    }
  }
}
function filterDuplicateInserts(changes, sentKeys) {
  const filtered = [];
  for (const change of changes) {
    if (change.type === `insert`) {
      if (sentKeys.has(change.key)) {
        continue;
      }
      sentKeys.add(change.key);
    } else if (change.type === `delete`) {
      sentKeys.delete(change.key);
    }
    filtered.push(change);
  }
  return filtered;
}
function trackBiggestSentValue(changes, current, sentKeys, comparator) {
  let biggest = current;
  let shouldResetLoadKey = false;
  for (const change of changes) {
    if (change.type === `delete`) continue;
    const isNewKey = !sentKeys.has(change.key);
    if (biggest === void 0) {
      biggest = change.value;
      shouldResetLoadKey = true;
    } else if (comparator(biggest, change.value) < 0) {
      biggest = change.value;
      shouldResetLoadKey = true;
    } else if (isNewKey) {
      shouldResetLoadKey = true;
    }
  }
  return { biggest, shouldResetLoadKey };
}
function computeSubscriptionOrderByHints(query, alias) {
  const { orderBy, limit, offset } = query;
  const effectiveLimit = limit !== void 0 && offset !== void 0 ? limit + offset : limit;
  const normalizedOrderBy = orderBy ? normalizeOrderByPaths(orderBy, alias) : void 0;
  const canPassOrderBy = normalizedOrderBy?.every((clause) => {
    const exp = clause.expression;
    if (exp.type !== `ref`) return false;
    const path = exp.path;
    return Array.isArray(path) && path.length === 1;
  }) ?? false;
  return {
    orderBy: canPassOrderBy ? normalizedOrderBy : void 0,
    limit: canPassOrderBy ? effectiveLimit : void 0
  };
}
function computeOrderedLoadCursor(orderByInfo, biggestSentRow, lastLoadRequestKey, alias, limit) {
  const { orderBy, valueExtractorForRawRow, offset } = orderByInfo;
  const extractedValues = biggestSentRow ? valueExtractorForRawRow(biggestSentRow) : void 0;
  let minValues;
  if (extractedValues !== void 0) {
    minValues = Array.isArray(extractedValues) ? extractedValues : [extractedValues];
  }
  const loadRequestKey = serializeValue({
    minValues: minValues ?? null,
    offset,
    limit
  });
  if (lastLoadRequestKey === loadRequestKey) {
    return void 0;
  }
  const normalizedOrderBy = normalizeOrderByPaths(orderBy, alias);
  return { minValues, normalizedOrderBy, loadRequestKey };
}
const loadMoreCallbackSymbol = /* @__PURE__ */ Symbol.for(
  `@tanstack/db.collection-config-builder`
);
class CollectionSubscriber {
  constructor(alias, collectionId, collection, collectionConfigBuilder) {
    this.alias = alias;
    this.collectionId = collectionId;
    this.collection = collection;
    this.collectionConfigBuilder = collectionConfigBuilder;
    this.biggest = void 0;
    this.subscriptionLoadingPromises = /* @__PURE__ */ new Map();
    this.sentToD2Keys = /* @__PURE__ */ new Set();
  }
  subscribe() {
    const whereClause = this.getWhereClauseForAlias();
    if (whereClause) {
      const whereExpression = normalizeExpressionPaths(whereClause, this.alias);
      return this.subscribeToChanges(whereExpression);
    }
    return this.subscribeToChanges();
  }
  subscribeToChanges(whereExpression) {
    const orderByInfo = this.getOrderByInfo();
    const trackLoadResult = (result) => {
      if (result instanceof Promise) {
        this.collectionConfigBuilder.liveQueryCollection._sync.trackLoadPromise(
          result
        );
      }
    };
    const onStatusChange = (event) => {
      const subscription2 = event.subscription;
      if (event.status === `loadingSubset`) {
        this.ensureLoadingPromise(subscription2);
      } else {
        const deferred = this.subscriptionLoadingPromises.get(subscription2);
        if (deferred) {
          this.subscriptionLoadingPromises.delete(subscription2);
          deferred.resolve();
        }
      }
    };
    let subscription;
    if (orderByInfo) {
      subscription = this.subscribeToOrderedChanges(
        whereExpression,
        orderByInfo,
        onStatusChange,
        trackLoadResult
      );
    } else {
      const includeInitialState = !this.collectionConfigBuilder.isLazyAlias(
        this.alias
      );
      subscription = this.subscribeToMatchingChanges(
        whereExpression,
        includeInitialState,
        onStatusChange
      );
    }
    if (subscription.status === `loadingSubset`) {
      this.ensureLoadingPromise(subscription);
    }
    const unsubscribe = () => {
      const deferred = this.subscriptionLoadingPromises.get(subscription);
      if (deferred) {
        this.subscriptionLoadingPromises.delete(subscription);
        deferred.resolve();
      }
      subscription.unsubscribe();
    };
    this.collectionConfigBuilder.currentSyncState.unsubscribeCallbacks.add(
      unsubscribe
    );
    return subscription;
  }
  sendChangesToPipeline(changes, callback) {
    const changesArray = Array.isArray(changes) ? changes : [...changes];
    const filteredChanges = filterDuplicateInserts(
      changesArray,
      this.sentToD2Keys
    );
    const input = this.collectionConfigBuilder.currentSyncState.inputs[this.alias];
    const sentChanges = sendChangesToInput(
      input,
      filteredChanges,
      this.collection.config.getKey
    );
    const dataLoader = sentChanges > 0 ? callback : void 0;
    this.collectionConfigBuilder.scheduleGraphRun(dataLoader, {
      alias: this.alias
    });
  }
  subscribeToMatchingChanges(whereExpression, includeInitialState, onStatusChange) {
    const sendChanges = (changes) => {
      this.sendChangesToPipeline(changes);
    };
    const hints = computeSubscriptionOrderByHints(
      this.collectionConfigBuilder.query,
      this.alias
    );
    const onLoadSubsetResult = includeInitialState ? (result) => {
      if (result instanceof Promise) {
        this.collectionConfigBuilder.liveQueryCollection._sync.trackLoadPromise(
          result
        );
      }
    } : void 0;
    const subscription = this.collection.subscribeChanges(sendChanges, {
      ...includeInitialState && { includeInitialState },
      whereExpression,
      onStatusChange,
      orderBy: hints.orderBy,
      limit: hints.limit,
      onLoadSubsetResult
    });
    return subscription;
  }
  subscribeToOrderedChanges(whereExpression, orderByInfo, onStatusChange, onLoadSubsetResult) {
    const { orderBy, offset, limit, index } = orderByInfo;
    const handleLoadSubsetResult = (result) => {
      if (result instanceof Promise) {
        this.pendingOrderedLoadPromise = result;
        result.finally(() => {
          if (this.pendingOrderedLoadPromise === result) {
            this.pendingOrderedLoadPromise = void 0;
          }
        });
      }
      onLoadSubsetResult(result);
    };
    this.orderedLoadSubsetResult = handleLoadSubsetResult;
    const subscriptionHolder = {};
    const sendChangesInRange = (changes) => {
      const changesArray = Array.isArray(changes) ? changes : [...changes];
      this.trackSentValues(changesArray, orderByInfo.comparator);
      const splittedChanges = splitUpdates(changesArray);
      this.sendChangesToPipelineWithTracking(
        splittedChanges,
        subscriptionHolder.current
      );
    };
    const subscription = this.collection.subscribeChanges(sendChangesInRange, {
      whereExpression,
      onStatusChange
    });
    subscriptionHolder.current = subscription;
    const truncateUnsubscribe = this.collection.on(`truncate`, () => {
      this.biggest = void 0;
      this.lastLoadRequestKey = void 0;
      this.pendingOrderedLoadPromise = void 0;
      this.sentToD2Keys.clear();
    });
    subscription.on(`unsubscribed`, () => {
      truncateUnsubscribe();
    });
    const normalizedOrderBy = normalizeOrderByPaths(orderBy, this.alias);
    if (index) {
      subscription.setOrderByIndex(index);
      subscription.requestLimitedSnapshot({
        limit: offset + limit,
        orderBy: normalizedOrderBy,
        trackLoadSubsetPromise: false,
        onLoadSubsetResult: handleLoadSubsetResult
      });
    } else {
      subscription.requestSnapshot({
        orderBy: normalizedOrderBy,
        limit: offset + limit,
        trackLoadSubsetPromise: false,
        onLoadSubsetResult: handleLoadSubsetResult
      });
    }
    return subscription;
  }
  // This function is called by maybeRunGraph
  // after each iteration of the query pipeline
  // to ensure that the orderBy operator has enough data to work with
  loadMoreIfNeeded(subscription) {
    const orderByInfo = this.getOrderByInfo();
    if (!orderByInfo) {
      return true;
    }
    const { dataNeeded } = orderByInfo;
    if (!dataNeeded) {
      return true;
    }
    if (this.pendingOrderedLoadPromise) {
      return true;
    }
    const n = dataNeeded();
    if (n > 0) {
      this.loadNextItems(n, subscription);
    }
    return true;
  }
  sendChangesToPipelineWithTracking(changes, subscription) {
    const orderByInfo = this.getOrderByInfo();
    if (!orderByInfo) {
      this.sendChangesToPipeline(changes);
      return;
    }
    const subscriptionWithLoader = subscription;
    subscriptionWithLoader[loadMoreCallbackSymbol] ??= this.loadMoreIfNeeded.bind(this, subscription);
    this.sendChangesToPipeline(
      changes,
      subscriptionWithLoader[loadMoreCallbackSymbol]
    );
  }
  // Loads the next `n` items from the collection
  // starting from the biggest item it has sent
  loadNextItems(n, subscription) {
    const orderByInfo = this.getOrderByInfo();
    if (!orderByInfo) {
      return;
    }
    const cursor = computeOrderedLoadCursor(
      orderByInfo,
      this.biggest,
      this.lastLoadRequestKey,
      this.alias,
      n
    );
    if (!cursor) return;
    this.lastLoadRequestKey = cursor.loadRequestKey;
    subscription.requestLimitedSnapshot({
      orderBy: cursor.normalizedOrderBy,
      limit: n,
      minValues: cursor.minValues,
      trackLoadSubsetPromise: false,
      onLoadSubsetResult: this.orderedLoadSubsetResult
    });
  }
  getWhereClauseForAlias() {
    const sourceWhereClausesCache = this.collectionConfigBuilder.sourceWhereClausesCache;
    if (!sourceWhereClausesCache) {
      return void 0;
    }
    return sourceWhereClausesCache.get(this.alias);
  }
  getOrderByInfo() {
    const info = this.collectionConfigBuilder.optimizableOrderByCollections[this.collectionId];
    if (info && info.alias === this.alias) {
      return info;
    }
    return void 0;
  }
  trackSentValues(changes, comparator) {
    const result = trackBiggestSentValue(
      changes,
      this.biggest,
      this.sentToD2Keys,
      comparator
    );
    this.biggest = result.biggest;
    if (result.shouldResetLoadKey) {
      this.lastLoadRequestKey = void 0;
    }
  }
  ensureLoadingPromise(subscription) {
    if (this.subscriptionLoadingPromises.has(subscription)) {
      return;
    }
    let resolve;
    const promise = new Promise((res) => {
      resolve = res;
    });
    this.subscriptionLoadingPromises.set(subscription, {
      resolve
    });
    this.collectionConfigBuilder.liveQueryCollection._sync.trackLoadPromise(
      promise
    );
  }
}
let liveQueryCollectionCounter = 0;
class CollectionConfigBuilder {
  constructor(config) {
    this.config = config;
    this.compiledAliasToCollectionId = {};
    this.resultKeys = /* @__PURE__ */ new WeakMap();
    this.orderByIndices = /* @__PURE__ */ new WeakMap();
    this.isGraphRunning = false;
    this.runCount = 0;
    this.isInErrorState = false;
    this.aliasDependencies = {};
    this.builderDependencies = /* @__PURE__ */ new Set();
    this.pendingGraphRuns = /* @__PURE__ */ new Map();
    this.subscriptions = {};
    this.lazySourcesCallbacks = {};
    this.lazySources = /* @__PURE__ */ new Set();
    this.optimizableOrderByCollections = {};
    this.id = config.id || `live-query-${++liveQueryCollectionCounter}`;
    this.query = buildQueryFromConfig(config);
    this.collections = extractCollectionsFromQuery(this.query);
    const collectionAliasesById = extractCollectionAliases(this.query);
    this.collectionByAlias = {};
    for (const [collectionId, aliases] of collectionAliasesById.entries()) {
      const collection = this.collections[collectionId];
      if (!collection) continue;
      for (const alias of aliases) {
        this.collectionByAlias[alias] = collection;
      }
    }
    if (this.query.orderBy && this.query.orderBy.length > 0) {
      this.compare = createOrderByComparator(this.orderByIndices);
    }
    this.compareOptions = this.config.defaultStringCollation ?? extractCollectionFromSource(this.query).compareOptions;
    this.compileBasePipeline();
  }
  /**
   * Recursively checks if a query or any of its subqueries contains joins
   */
  hasJoins(query) {
    if (query.join && query.join.length > 0) {
      return true;
    }
    if (query.from.type === `queryRef`) {
      if (this.hasJoins(query.from.query)) {
        return true;
      }
    }
    return false;
  }
  getConfig() {
    return {
      id: this.id,
      getKey: this.config.getKey || ((item) => this.resultKeys.get(item)),
      sync: this.getSyncConfig(),
      compare: this.compare,
      defaultStringCollation: this.compareOptions,
      gcTime: this.config.gcTime || 5e3,
      // 5 seconds by default for live queries
      schema: this.config.schema,
      onInsert: this.config.onInsert,
      onUpdate: this.config.onUpdate,
      onDelete: this.config.onDelete,
      startSync: this.config.startSync,
      singleResult: this.query.singleResult,
      utils: {
        getRunCount: this.getRunCount.bind(this),
        setWindow: this.setWindow.bind(this),
        getWindow: this.getWindow.bind(this),
        [LIVE_QUERY_INTERNAL]: {
          getBuilder: () => this,
          hasCustomGetKey: !!this.config.getKey,
          hasJoins: this.hasJoins(this.query),
          hasDistinct: !!this.query.distinct
        }
      }
    };
  }
  setWindow(options) {
    if (!this.windowFn) {
      throw new SetWindowRequiresOrderByError();
    }
    this.currentWindow = options;
    this.windowFn(options);
    this.maybeRunGraphFn?.();
    if (this.liveQueryCollection?.isLoadingSubset) {
      return new Promise((resolve) => {
        const unsubscribe = this.liveQueryCollection.on(
          `loadingSubset:change`,
          (event) => {
            if (!event.isLoadingSubset) {
              unsubscribe();
              resolve();
            }
          }
        );
      });
    }
    return true;
  }
  getWindow() {
    if (!this.windowFn || !this.currentWindow) {
      return void 0;
    }
    return {
      offset: this.currentWindow.offset ?? 0,
      limit: this.currentWindow.limit ?? 0
    };
  }
  /**
   * Resolves a collection alias to its collection ID.
   *
   * Uses a two-tier lookup strategy:
   * 1. First checks compiled aliases (includes subquery inner aliases)
   * 2. Falls back to declared aliases from the query's from/join clauses
   *
   * @param alias - The alias to resolve (e.g., "employee", "manager")
   * @returns The collection ID that the alias references
   * @throws {Error} If the alias is not found in either lookup
   */
  getCollectionIdForAlias(alias) {
    const compiled = this.compiledAliasToCollectionId[alias];
    if (compiled) {
      return compiled;
    }
    const collection = this.collectionByAlias[alias];
    if (collection) {
      return collection.id;
    }
    throw new Error(`Unknown source alias "${alias}"`);
  }
  isLazyAlias(alias) {
    return this.lazySources.has(alias);
  }
  // The callback function is called after the graph has run.
  // This gives the callback a chance to load more data if needed,
  // that's used to optimize orderBy operators that set a limit,
  // in order to load some more data if we still don't have enough rows after the pipeline has run.
  // That can happen because even though we load N rows, the pipeline might filter some of these rows out
  // causing the orderBy operator to receive less than N rows or even no rows at all.
  // So this callback would notice that it doesn't have enough rows and load some more.
  // The callback returns a boolean, when it's true it's done loading data and we can mark the collection as ready.
  maybeRunGraph(callback) {
    if (this.isGraphRunning) {
      return;
    }
    if (!this.currentSyncConfig || !this.currentSyncState) {
      throw new Error(
        `maybeRunGraph called without active sync session. This should not happen.`
      );
    }
    this.isGraphRunning = true;
    try {
      const { begin, commit } = this.currentSyncConfig;
      const syncState = this.currentSyncState;
      if (this.isInErrorState) {
        return;
      }
      if (syncState.subscribedToAllCollections) {
        let callbackCalled = false;
        while (syncState.graph.pendingWork()) {
          syncState.graph.run();
          syncState.flushPendingChanges?.();
          callback?.();
          callbackCalled = true;
        }
        if (!callbackCalled) {
          callback?.();
        }
        if (syncState.messagesCount === 0) {
          begin();
          commit();
        }
        this.updateLiveQueryStatus(this.currentSyncConfig);
      }
    } finally {
      this.isGraphRunning = false;
    }
  }
  /**
   * Schedules a graph run with the transaction-scoped scheduler.
   * Ensures each builder runs at most once per transaction, with automatic dependency tracking
   * to run parent queries before child queries. Outside a transaction, runs immediately.
   *
   * Multiple calls during a transaction are coalesced into a single execution.
   * Dependencies are auto-discovered from subscribed live queries, or can be overridden.
   * Load callbacks are combined when entries merge.
   *
   * Uses the current sync session's config and syncState from instance properties.
   *
   * @param callback - Optional callback to load more data if needed (returns true when done)
   * @param options - Optional scheduling configuration
   * @param options.contextId - Transaction ID to group work; defaults to active transaction
   * @param options.jobId - Unique identifier for this job; defaults to this builder instance
   * @param options.alias - Source alias that triggered this schedule; adds alias-specific dependencies
   * @param options.dependencies - Explicit dependency list; overrides auto-discovered dependencies
   */
  scheduleGraphRun(callback, options) {
    const contextId = options?.contextId ?? getActiveTransaction()?.id;
    const jobId = options?.jobId ?? this;
    const dependentBuilders = (() => {
      if (options?.dependencies) {
        return options.dependencies;
      }
      const deps = new Set(this.builderDependencies);
      if (options?.alias) {
        const aliasDeps = this.aliasDependencies[options.alias];
        if (aliasDeps) {
          for (const dep of aliasDeps) {
            deps.add(dep);
          }
        }
      }
      deps.delete(this);
      return Array.from(deps);
    })();
    if (contextId) {
      for (const dep of dependentBuilders) {
        if (typeof dep.scheduleGraphRun === `function`) {
          dep.scheduleGraphRun(void 0, { contextId });
        }
      }
    }
    if (!this.currentSyncConfig || !this.currentSyncState) {
      throw new Error(
        `scheduleGraphRun called without active sync session. This should not happen.`
      );
    }
    let pending = contextId ? this.pendingGraphRuns.get(contextId) : void 0;
    if (!pending) {
      pending = {
        loadCallbacks: /* @__PURE__ */ new Set()
      };
      if (contextId) {
        this.pendingGraphRuns.set(contextId, pending);
      }
    }
    if (callback) {
      pending.loadCallbacks.add(callback);
    }
    const pendingToPass = contextId ? void 0 : pending;
    transactionScopedScheduler.schedule({
      contextId,
      jobId,
      dependencies: dependentBuilders,
      run: () => this.executeGraphRun(contextId, pendingToPass)
    });
  }
  /**
   * Clears pending graph run state for a specific context.
   * Called when the scheduler clears a context (e.g., transaction rollback/abort).
   */
  clearPendingGraphRun(contextId) {
    this.pendingGraphRuns.delete(contextId);
  }
  /**
   * Returns true if this builder has a pending graph run for the given context.
   */
  hasPendingGraphRun(contextId) {
    return this.pendingGraphRuns.has(contextId);
  }
  /**
   * Executes a pending graph run. Called by the scheduler when dependencies are satisfied.
   * Clears the pending state BEFORE execution so that any re-schedules during the run
   * create fresh state and don't interfere with the current execution.
   * Uses instance sync state - if sync has ended, gracefully returns without executing.
   *
   * @param contextId - Optional context ID to look up pending state
   * @param pendingParam - For immediate execution (no context), pending state is passed directly
   */
  executeGraphRun(contextId, pendingParam) {
    const pending = pendingParam ?? (contextId ? this.pendingGraphRuns.get(contextId) : void 0);
    if (contextId) {
      this.pendingGraphRuns.delete(contextId);
    }
    if (!pending) {
      return;
    }
    if (!this.currentSyncConfig || !this.currentSyncState) {
      return;
    }
    this.incrementRunCount();
    const combinedLoader = () => {
      let allDone = true;
      let firstError;
      pending.loadCallbacks.forEach((loader) => {
        try {
          allDone = loader() && allDone;
        } catch (error) {
          allDone = false;
          firstError ??= error;
        }
      });
      if (firstError) {
        throw firstError;
      }
      return allDone;
    };
    this.maybeRunGraph(combinedLoader);
  }
  getSyncConfig() {
    return {
      rowUpdateMode: `full`,
      sync: this.syncFn.bind(this)
    };
  }
  incrementRunCount() {
    this.runCount++;
  }
  getRunCount() {
    return this.runCount;
  }
  syncFn(config) {
    this.liveQueryCollection = config.collection;
    this.currentSyncConfig = config;
    const syncState = {
      messagesCount: 0,
      subscribedToAllCollections: false,
      unsubscribeCallbacks: /* @__PURE__ */ new Set()
    };
    const fullSyncState = this.extendPipelineWithChangeProcessing(
      config,
      syncState
    );
    this.currentSyncState = fullSyncState;
    this.unsubscribeFromSchedulerClears = transactionScopedScheduler.onClear(
      (contextId) => {
        this.clearPendingGraphRun(contextId);
      }
    );
    const loadingSubsetUnsubscribe = config.collection.on(
      `loadingSubset:change`,
      (event) => {
        if (!event.isLoadingSubset) {
          this.updateLiveQueryStatus(config);
        }
      }
    );
    syncState.unsubscribeCallbacks.add(loadingSubsetUnsubscribe);
    const loadSubsetDataCallbacks = this.subscribeToAllCollections(
      config,
      fullSyncState
    );
    this.maybeRunGraphFn = () => this.scheduleGraphRun(loadSubsetDataCallbacks);
    this.scheduleGraphRun(loadSubsetDataCallbacks);
    return () => {
      syncState.unsubscribeCallbacks.forEach((unsubscribe) => unsubscribe());
      this.currentSyncConfig = void 0;
      this.currentSyncState = void 0;
      this.pendingGraphRuns.clear();
      this.graphCache = void 0;
      this.inputsCache = void 0;
      this.pipelineCache = void 0;
      this.sourceWhereClausesCache = void 0;
      this.lazySources.clear();
      this.optimizableOrderByCollections = {};
      this.lazySourcesCallbacks = {};
      Object.keys(this.subscriptions).forEach(
        (key) => delete this.subscriptions[key]
      );
      this.compiledAliasToCollectionId = {};
      this.unsubscribeFromSchedulerClears?.();
      this.unsubscribeFromSchedulerClears = void 0;
    };
  }
  /**
   * Compiles the query pipeline with all declared aliases.
   */
  compileBasePipeline() {
    this.graphCache = new D2();
    this.inputsCache = Object.fromEntries(
      Object.keys(this.collectionByAlias).map((alias) => [
        alias,
        this.graphCache.newInput()
      ])
    );
    const compilation = compileQuery(
      this.query,
      this.inputsCache,
      this.collections,
      this.subscriptions,
      this.lazySourcesCallbacks,
      this.lazySources,
      this.optimizableOrderByCollections,
      (windowFn) => {
        this.windowFn = windowFn;
      }
    );
    this.pipelineCache = compilation.pipeline;
    this.sourceWhereClausesCache = compilation.sourceWhereClauses;
    this.compiledAliasToCollectionId = compilation.aliasToCollectionId;
    const missingAliases = Object.keys(this.compiledAliasToCollectionId).filter(
      (alias) => !Object.hasOwn(this.inputsCache, alias)
    );
    if (missingAliases.length > 0) {
      throw new MissingAliasInputsError(missingAliases);
    }
  }
  maybeCompileBasePipeline() {
    if (!this.graphCache || !this.inputsCache || !this.pipelineCache) {
      this.compileBasePipeline();
    }
    return {
      graph: this.graphCache,
      inputs: this.inputsCache,
      pipeline: this.pipelineCache
    };
  }
  extendPipelineWithChangeProcessing(config, syncState) {
    const { begin, commit } = config;
    const { graph, inputs, pipeline } = this.maybeCompileBasePipeline();
    let pendingChanges = /* @__PURE__ */ new Map();
    pipeline.pipe(
      output((data) => {
        const messages = data.getInner();
        syncState.messagesCount += messages.length;
        messages.reduce(accumulateChanges, pendingChanges);
      })
    );
    syncState.flushPendingChanges = () => {
      if (pendingChanges.size === 0) {
        return;
      }
      let changesToApply = pendingChanges;
      if (this.config.getKey) {
        const merged = /* @__PURE__ */ new Map();
        for (const [, changes] of pendingChanges) {
          const customKey = this.config.getKey(changes.value);
          const existing = merged.get(customKey);
          if (existing) {
            existing.inserts += changes.inserts;
            existing.deletes += changes.deletes;
            if (changes.inserts > 0) {
              existing.value = changes.value;
              if (changes.orderByIndex !== void 0) {
                existing.orderByIndex = changes.orderByIndex;
              }
            }
          } else {
            merged.set(customKey, { ...changes });
          }
        }
        changesToApply = merged;
      }
      begin();
      changesToApply.forEach(this.applyChanges.bind(this, config));
      commit();
      pendingChanges = /* @__PURE__ */ new Map();
    };
    graph.finalize();
    syncState.graph = graph;
    syncState.inputs = inputs;
    syncState.pipeline = pipeline;
    return syncState;
  }
  applyChanges(config, changes, key) {
    const { write, collection } = config;
    const { deletes, inserts, value, orderByIndex } = changes;
    this.resultKeys.set(value, key);
    if (orderByIndex !== void 0) {
      this.orderByIndices.set(value, orderByIndex);
    }
    if (inserts && deletes === 0) {
      write({
        value,
        type: `insert`
      });
    } else if (
      // Insert & update(s) (updates are a delete & insert)
      inserts > deletes || // Just update(s) but the item is already in the collection (so
      // was inserted previously).
      inserts === deletes && collection.has(collection.getKeyFromItem(value))
    ) {
      write({
        value,
        type: `update`
      });
    } else if (deletes > 0) {
      write({
        value,
        type: `delete`
      });
    } else {
      throw new Error(
        `Could not apply changes: ${JSON.stringify(changes)}. This should never happen.`
      );
    }
  }
  /**
   * Handle status changes from source collections
   */
  handleSourceStatusChange(config, collectionId, event) {
    const { status } = event;
    if (status === `error`) {
      this.transitionToError(
        `Source collection '${collectionId}' entered error state`
      );
      return;
    }
    if (status === `cleaned-up`) {
      this.transitionToError(
        `Source collection '${collectionId}' was manually cleaned up while live query '${this.id}' depends on it. Live queries prevent automatic GC, so this was likely a manual cleanup() call.`
      );
      return;
    }
    this.updateLiveQueryStatus(config);
  }
  /**
   * Update the live query status based on source collection statuses
   */
  updateLiveQueryStatus(config) {
    const { markReady } = config;
    if (this.isInErrorState) {
      return;
    }
    const subscribedToAll = this.currentSyncState?.subscribedToAllCollections;
    const allReady = this.allCollectionsReady();
    const isLoading = this.liveQueryCollection?.isLoadingSubset;
    if (subscribedToAll && allReady && !isLoading) {
      markReady();
    }
  }
  /**
   * Transition the live query to error state
   */
  transitionToError(message) {
    this.isInErrorState = true;
    console.error(`[Live Query Error] ${message}`);
    this.liveQueryCollection?._lifecycle.setStatus(`error`);
  }
  allCollectionsReady() {
    return Object.values(this.collections).every(
      (collection) => collection.isReady()
    );
  }
  /**
   * Creates per-alias subscriptions enabling self-join support.
   * Each alias gets its own subscription with independent filters, even for the same collection.
   * Example: `{ employee: col, manager: col }` creates two separate subscriptions.
   */
  subscribeToAllCollections(config, syncState) {
    const compiledAliases = Object.entries(this.compiledAliasToCollectionId);
    if (compiledAliases.length === 0) {
      throw new Error(
        `Compiler returned no alias metadata for query '${this.id}'. This should not happen; please report.`
      );
    }
    const loaders = compiledAliases.map(([alias, collectionId]) => {
      const collection = this.collectionByAlias[alias] ?? this.collections[collectionId];
      const dependencyBuilder = getCollectionBuilder(collection);
      if (dependencyBuilder && dependencyBuilder !== this) {
        this.aliasDependencies[alias] = [dependencyBuilder];
        this.builderDependencies.add(dependencyBuilder);
      } else {
        this.aliasDependencies[alias] = [];
      }
      const collectionSubscriber = new CollectionSubscriber(
        alias,
        collectionId,
        collection,
        this
      );
      const statusUnsubscribe = collection.on(`status:change`, (event) => {
        this.handleSourceStatusChange(config, collectionId, event);
      });
      syncState.unsubscribeCallbacks.add(statusUnsubscribe);
      const subscription = collectionSubscriber.subscribe();
      this.subscriptions[alias] = subscription;
      const loadMore = collectionSubscriber.loadMoreIfNeeded.bind(
        collectionSubscriber,
        subscription
      );
      return loadMore;
    });
    const loadSubsetDataCallbacks = () => {
      loaders.map((loader) => loader());
      return true;
    };
    syncState.subscribedToAllCollections = true;
    return loadSubsetDataCallbacks;
  }
}
function createOrderByComparator(orderByIndices) {
  return (val1, val2) => {
    const index1 = orderByIndices.get(val1);
    const index2 = orderByIndices.get(val2);
    if (index1 && index2) {
      if (index1 < index2) {
        return -1;
      } else if (index1 > index2) {
        return 1;
      } else {
        return 0;
      }
    }
    return 0;
  };
}
function accumulateChanges(acc, [[key, tupleData], multiplicity]) {
  const [value, orderByIndex] = tupleData;
  const changes = acc.get(key) || {
    deletes: 0,
    inserts: 0,
    value,
    orderByIndex
  };
  if (multiplicity < 0) {
    changes.deletes += Math.abs(multiplicity);
  } else if (multiplicity > 0) {
    changes.inserts += multiplicity;
    changes.value = value;
    if (orderByIndex !== void 0) {
      changes.orderByIndex = orderByIndex;
    }
  }
  acc.set(key, changes);
  return acc;
}
function liveQueryCollectionOptions(config) {
  const collectionConfigBuilder = new CollectionConfigBuilder(config);
  return collectionConfigBuilder.getConfig();
}
function createLiveQueryCollection(configOrQuery) {
  if (typeof configOrQuery === `function`) {
    const config = {
      query: configOrQuery
    };
    const options = liveQueryCollectionOptions(config);
    return bridgeToCreateCollection(options);
  } else {
    const config = configOrQuery;
    const options = liveQueryCollectionOptions(config);
    if (config.utils) {
      options.utils = { ...options.utils, ...config.utils };
    }
    return bridgeToCreateCollection(options);
  }
}
function bridgeToCreateCollection(options) {
  const collection = createCollection(options);
  const builder = getBuilderFromConfig(options);
  if (builder) {
    registerCollectionBuilder(collection, builder);
  }
  return collection;
}
export {
  BaseQueryBuilder as B,
  CollectionImpl as C,
  TanStackDBError as T,
  createCollection as a,
  createLiveQueryCollection as c,
  deepEquals as d,
  eq as e
};
