import { h as hashKey, Q as QueryObserver } from "./tanstack__query-core.mjs";
import { T as TanStackDBError, d as deepEquals } from "./tanstack__db.mjs";
class QueryCollectionError extends TanStackDBError {
  constructor(message) {
    super(message);
    this.name = `QueryCollectionError`;
  }
}
class QueryKeyRequiredError extends QueryCollectionError {
  constructor() {
    super(`[QueryCollection] queryKey must be provided.`);
    this.name = `QueryKeyRequiredError`;
  }
}
class QueryFnRequiredError extends QueryCollectionError {
  constructor() {
    super(`[QueryCollection] queryFn must be provided.`);
    this.name = `QueryFnRequiredError`;
  }
}
class QueryClientRequiredError extends QueryCollectionError {
  constructor() {
    super(`[QueryCollection] queryClient must be provided.`);
    this.name = `QueryClientRequiredError`;
  }
}
class GetKeyRequiredError extends QueryCollectionError {
  constructor() {
    super(`[QueryCollection] getKey must be provided.`);
    this.name = `GetKeyRequiredError`;
  }
}
class SyncNotInitializedError extends QueryCollectionError {
  constructor() {
    super(
      `Collection must be in 'ready' state for manual sync operations. Sync not initialized yet.`
    );
    this.name = `SyncNotInitializedError`;
  }
}
class DuplicateKeyInBatchError extends QueryCollectionError {
  constructor(key) {
    super(`Duplicate key '${key}' found within batch operations`);
    this.name = `DuplicateKeyInBatchError`;
  }
}
class UpdateOperationItemNotFoundError extends QueryCollectionError {
  constructor(key) {
    super(`Update operation: Item with key '${key}' does not exist`);
    this.name = `UpdateOperationItemNotFoundError`;
  }
}
class DeleteOperationItemNotFoundError extends QueryCollectionError {
  constructor(key) {
    super(`Delete operation: Item with key '${key}' does not exist`);
    this.name = `DeleteOperationItemNotFoundError`;
  }
}
const activeBatchContexts = /* @__PURE__ */ new WeakMap();
function normalizeOperations(ops, ctx) {
  const operations = Array.isArray(ops) ? ops : [ops];
  const normalized = [];
  for (const op of operations) {
    if (op.type === `delete`) {
      const keys = Array.isArray(op.key) ? op.key : [op.key];
      for (const key of keys) {
        normalized.push({ type: `delete`, key });
      }
    } else {
      const items = Array.isArray(op.data) ? op.data : [op.data];
      for (const item of items) {
        let key;
        if (op.type === `update`) {
          key = ctx.getKey(item);
        } else {
          const resolved = ctx.collection.validateData(
            item,
            op.type === `upsert` ? `insert` : op.type
          );
          key = ctx.getKey(resolved);
        }
        normalized.push({ type: op.type, key, data: item });
      }
    }
  }
  return normalized;
}
function validateOperations(operations, ctx) {
  const seenKeys = /* @__PURE__ */ new Set();
  for (const op of operations) {
    if (seenKeys.has(op.key)) {
      throw new DuplicateKeyInBatchError(op.key);
    }
    seenKeys.add(op.key);
    if (op.type === `update`) {
      if (!ctx.collection._state.syncedData.has(op.key)) {
        throw new UpdateOperationItemNotFoundError(op.key);
      }
    } else if (op.type === `delete`) {
      if (!ctx.collection._state.syncedData.has(op.key)) {
        throw new DeleteOperationItemNotFoundError(op.key);
      }
    }
  }
}
function performWriteOperations(operations, ctx) {
  const normalized = normalizeOperations(operations, ctx);
  validateOperations(normalized, ctx);
  ctx.begin({ immediate: true });
  for (const op of normalized) {
    switch (op.type) {
      case `insert`: {
        const resolved = ctx.collection.validateData(op.data, `insert`);
        ctx.write({
          type: `insert`,
          value: resolved
        });
        break;
      }
      case `update`: {
        const currentItem = ctx.collection._state.syncedData.get(op.key);
        const updatedItem = {
          ...currentItem,
          ...op.data
        };
        const resolved = ctx.collection.validateData(
          updatedItem,
          `update`,
          op.key
        );
        ctx.write({
          type: `update`,
          value: resolved
        });
        break;
      }
      case `delete`: {
        const currentItem = ctx.collection._state.syncedData.get(op.key);
        ctx.write({
          type: `delete`,
          value: currentItem
        });
        break;
      }
      case `upsert`: {
        const existsInSyncedStore = ctx.collection._state.syncedData.has(op.key);
        const resolved = ctx.collection.validateData(
          op.data,
          existsInSyncedStore ? `update` : `insert`,
          op.key
        );
        if (existsInSyncedStore) {
          ctx.write({
            type: `update`,
            value: resolved
          });
        } else {
          ctx.write({
            type: `insert`,
            value: resolved
          });
        }
        break;
      }
    }
  }
  ctx.commit();
  const updatedData = Array.from(ctx.collection._state.syncedData.values());
  if (ctx.updateCacheData) {
    ctx.updateCacheData(updatedData);
  } else {
    ctx.queryClient.setQueryData(ctx.queryKey, updatedData);
  }
}
function createWriteUtils(getContext) {
  function ensureContext() {
    const context = getContext();
    if (!context) {
      throw new SyncNotInitializedError();
    }
    return context;
  }
  return {
    writeInsert(data) {
      const operation = {
        type: `insert`,
        data
      };
      const ctx = ensureContext();
      const batchContext = activeBatchContexts.get(ctx);
      if (batchContext?.isActive) {
        batchContext.operations.push(operation);
        return;
      }
      performWriteOperations(operation, ctx);
    },
    writeUpdate(data) {
      const operation = {
        type: `update`,
        data
      };
      const ctx = ensureContext();
      const batchContext = activeBatchContexts.get(ctx);
      if (batchContext?.isActive) {
        batchContext.operations.push(operation);
        return;
      }
      performWriteOperations(operation, ctx);
    },
    writeDelete(key) {
      const operation = {
        type: `delete`,
        key
      };
      const ctx = ensureContext();
      const batchContext = activeBatchContexts.get(ctx);
      if (batchContext?.isActive) {
        batchContext.operations.push(operation);
        return;
      }
      performWriteOperations(operation, ctx);
    },
    writeUpsert(data) {
      const operation = {
        type: `upsert`,
        data
      };
      const ctx = ensureContext();
      const batchContext = activeBatchContexts.get(ctx);
      if (batchContext?.isActive) {
        batchContext.operations.push(operation);
        return;
      }
      performWriteOperations(operation, ctx);
    },
    writeBatch(callback) {
      const ctx = ensureContext();
      const existingBatch = activeBatchContexts.get(ctx);
      if (existingBatch?.isActive) {
        throw new Error(
          `Cannot nest writeBatch calls. Complete the current batch before starting a new one.`
        );
      }
      const batchContext = {
        operations: [],
        isActive: true
      };
      activeBatchContexts.set(ctx, batchContext);
      try {
        const result = callback();
        if (
          // @ts-expect-error - Runtime check for async callback, callback is typed as () => void but user might pass async
          // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
          result && typeof result === `object` && `then` in result && // @ts-expect-error - Runtime check for async callback, callback is typed as () => void but user might pass async
          typeof result.then === `function`
        ) {
          throw new Error(
            `writeBatch does not support async callbacks. The callback must be synchronous.`
          );
        }
        if (batchContext.operations.length > 0) {
          performWriteOperations(batchContext.operations, ctx);
        }
      } finally {
        batchContext.isActive = false;
        activeBatchContexts.delete(ctx);
      }
    }
  };
}
function serializeLoadSubsetOptions(options) {
  if (!options) {
    return void 0;
  }
  const result = {};
  if (options.where) {
    result.where = serializeExpression(options.where);
  }
  if (options.orderBy?.length) {
    result.orderBy = options.orderBy.map((clause) => {
      const baseOrderBy = {
        expression: serializeExpression(clause.expression),
        direction: clause.compareOptions.direction,
        nulls: clause.compareOptions.nulls,
        stringSort: clause.compareOptions.stringSort
      };
      if (clause.compareOptions.stringSort === `locale`) {
        return {
          ...baseOrderBy,
          locale: clause.compareOptions.locale,
          localeOptions: clause.compareOptions.localeOptions
        };
      }
      return baseOrderBy;
    });
  }
  if (options.limit !== void 0) {
    result.limit = options.limit;
  }
  if (options.offset !== void 0) {
    result.offset = options.offset;
  }
  return Object.keys(result).length === 0 ? void 0 : JSON.stringify(result);
}
function serializeExpression(expr) {
  if (!expr) {
    return null;
  }
  switch (expr.type) {
    case `val`:
      return {
        type: `val`,
        value: serializeValue(expr.value)
      };
    case `ref`:
      return {
        type: `ref`,
        path: [...expr.path]
      };
    case `func`:
      return {
        type: `func`,
        name: expr.name,
        args: expr.args.map((arg) => serializeExpression(arg))
      };
    default:
      return null;
  }
}
function serializeValue(value) {
  if (value === void 0) {
    return { __type: `undefined` };
  }
  if (typeof value === `number`) {
    if (Number.isNaN(value)) {
      return { __type: `nan` };
    }
    if (value === Number.POSITIVE_INFINITY) {
      return { __type: `infinity`, sign: 1 };
    }
    if (value === Number.NEGATIVE_INFINITY) {
      return { __type: `infinity`, sign: -1 };
    }
  }
  if (value === null || typeof value === `string` || typeof value === `number` || typeof value === `boolean`) {
    return value;
  }
  if (value instanceof Date) {
    return { __type: `date`, value: value.toJSON() };
  }
  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item));
  }
  if (typeof value === `object`) {
    return Object.fromEntries(
      Object.entries(value).map(([key, val]) => [
        key,
        serializeValue(val)
      ])
    );
  }
  return value;
}
class QueryCollectionUtilsImpl {
  constructor(state, refetch, writeUtils) {
    this.state = state;
    this.refetchFn = refetch;
    this.refetch = refetch;
    this.writeInsert = writeUtils.writeInsert;
    this.writeUpdate = writeUtils.writeUpdate;
    this.writeDelete = writeUtils.writeDelete;
    this.writeUpsert = writeUtils.writeUpsert;
    this.writeBatch = writeUtils.writeBatch;
  }
  async clearError() {
    this.state.lastError = void 0;
    this.state.errorCount = 0;
    this.state.lastErrorUpdatedAt = 0;
    await this.refetchFn({ throwOnError: true });
  }
  // Getters for error state
  get lastError() {
    return this.state.lastError;
  }
  get isError() {
    return !!this.state.lastError;
  }
  get errorCount() {
    return this.state.errorCount;
  }
  // Getters for QueryObserver state
  get isFetching() {
    return Array.from(this.state.observers.values()).some(
      (observer) => observer.getCurrentResult().isFetching
    );
  }
  get isRefetching() {
    return Array.from(this.state.observers.values()).some(
      (observer) => observer.getCurrentResult().isRefetching
    );
  }
  get isLoading() {
    return Array.from(this.state.observers.values()).some(
      (observer) => observer.getCurrentResult().isLoading
    );
  }
  get dataUpdatedAt() {
    return Math.max(
      0,
      ...Array.from(this.state.observers.values()).map(
        (observer) => observer.getCurrentResult().dataUpdatedAt
      )
    );
  }
  get fetchStatus() {
    return Array.from(this.state.observers.values()).map(
      (observer) => observer.getCurrentResult().fetchStatus
    );
  }
}
function queryCollectionOptions(config) {
  const {
    queryKey,
    queryFn,
    select,
    queryClient,
    enabled,
    refetchInterval,
    retry,
    retryDelay,
    staleTime,
    getKey,
    onInsert,
    onUpdate,
    onDelete,
    meta,
    ...baseCollectionConfig
  } = config;
  const syncMode = baseCollectionConfig.syncMode ?? `eager`;
  if (!queryKey) {
    throw new QueryKeyRequiredError();
  }
  if (!queryFn) {
    throw new QueryFnRequiredError();
  }
  if (!queryClient) {
    throw new QueryClientRequiredError();
  }
  if (!getKey) {
    throw new GetKeyRequiredError();
  }
  const state = {
    lastError: void 0,
    errorCount: 0,
    lastErrorUpdatedAt: 0,
    observers: /* @__PURE__ */ new Map()
  };
  const hashToQueryKey = /* @__PURE__ */ new Map();
  const queryToRows = /* @__PURE__ */ new Map();
  const rowToQueries = /* @__PURE__ */ new Map();
  const unsubscribes = /* @__PURE__ */ new Map();
  const queryRefCounts = /* @__PURE__ */ new Map();
  const addRow = (rowKey, hashedQueryKey) => {
    const rowToQueriesSet = rowToQueries.get(rowKey) || /* @__PURE__ */ new Set();
    rowToQueriesSet.add(hashedQueryKey);
    rowToQueries.set(rowKey, rowToQueriesSet);
    const queryToRowsSet = queryToRows.get(hashedQueryKey) || /* @__PURE__ */ new Set();
    queryToRowsSet.add(rowKey);
    queryToRows.set(hashedQueryKey, queryToRowsSet);
  };
  const removeRow = (rowKey, hashedQuerKey) => {
    const rowToQueriesSet = rowToQueries.get(rowKey) || /* @__PURE__ */ new Set();
    rowToQueriesSet.delete(hashedQuerKey);
    rowToQueries.set(rowKey, rowToQueriesSet);
    const queryToRowsSet = queryToRows.get(hashedQuerKey) || /* @__PURE__ */ new Set();
    queryToRowsSet.delete(rowKey);
    queryToRows.set(hashedQuerKey, queryToRowsSet);
    return rowToQueriesSet.size === 0;
  };
  const internalSync = (params) => {
    const { begin, write, commit, markReady, collection } = params;
    let syncStarted = false;
    const generateQueryKeyFromOptions = (opts) => {
      if (typeof queryKey === `function`) {
        return queryKey(opts);
      } else if (syncMode === `on-demand`) {
        const serialized = serializeLoadSubsetOptions(opts);
        return serialized !== void 0 ? [...queryKey, serialized] : queryKey;
      } else {
        return queryKey;
      }
    };
    const createQueryFromOpts = (opts = {}, queryFunction = queryFn) => {
      const key = generateQueryKeyFromOptions(opts);
      const hashedQueryKey = hashKey(key);
      const extendedMeta = { ...meta, loadSubsetOptions: opts };
      if (state.observers.has(hashedQueryKey)) {
        queryRefCounts.set(
          hashedQueryKey,
          (queryRefCounts.get(hashedQueryKey) || 0) + 1
        );
        const observer = state.observers.get(hashedQueryKey);
        const currentResult = observer.getCurrentResult();
        if (currentResult.isSuccess) {
          return true;
        } else if (currentResult.isError) {
          return Promise.reject(currentResult.error);
        } else {
          const cachedData2 = queryClient.getQueryData(key);
          if (cachedData2 !== void 0) {
            return true;
          }
          return new Promise((resolve, reject) => {
            const unsubscribe = observer.subscribe((result) => {
              queueMicrotask(() => {
                if (result.isSuccess) {
                  unsubscribe();
                  resolve();
                } else if (result.isError) {
                  unsubscribe();
                  reject(result.error);
                }
              });
            });
          });
        }
      }
      const observerOptions = {
        queryKey: key,
        queryFn: queryFunction,
        meta: extendedMeta,
        structuralSharing: true,
        notifyOnChangeProps: `all`,
        // Only include options that are explicitly defined to allow QueryClient defaultOptions to be used
        ...enabled !== void 0 && { enabled },
        ...refetchInterval !== void 0 && { refetchInterval },
        ...retry !== void 0 && { retry },
        ...retryDelay !== void 0 && { retryDelay },
        ...staleTime !== void 0 && { staleTime }
      };
      const localObserver = new QueryObserver(queryClient, observerOptions);
      hashToQueryKey.set(hashedQueryKey, key);
      state.observers.set(hashedQueryKey, localObserver);
      queryRefCounts.set(
        hashedQueryKey,
        (queryRefCounts.get(hashedQueryKey) || 0) + 1
      );
      const cachedData = queryClient.getQueryData(key);
      if (cachedData !== void 0) {
        if (syncStarted || collection.subscriberCount > 0) {
          subscribeToQuery(localObserver, hashedQueryKey);
        }
        return true;
      }
      const readyPromise = new Promise((resolve, reject) => {
        const unsubscribe = localObserver.subscribe((result) => {
          queueMicrotask(() => {
            if (result.isSuccess) {
              unsubscribe();
              resolve();
            } else if (result.isError) {
              unsubscribe();
              reject(result.error);
            }
          });
        });
      });
      if (syncStarted || collection.subscriberCount > 0) {
        subscribeToQuery(localObserver, hashedQueryKey);
      }
      return readyPromise;
    };
    const makeQueryResultHandler = (queryKey2) => {
      const hashedQueryKey = hashKey(queryKey2);
      const handleQueryResult = (result) => {
        if (result.isSuccess) {
          state.lastError = void 0;
          state.errorCount = 0;
          const rawData = result.data;
          const newItemsArray = select ? select(rawData) : rawData;
          if (!Array.isArray(newItemsArray) || newItemsArray.some((item) => typeof item !== `object`)) {
            const errorMessage = select ? `@tanstack/query-db-collection: select() must return an array of objects. Got: ${typeof newItemsArray} for queryKey ${JSON.stringify(queryKey2)}` : `@tanstack/query-db-collection: queryFn must return an array of objects. Got: ${typeof newItemsArray} for queryKey ${JSON.stringify(queryKey2)}`;
            console.error(errorMessage);
            return;
          }
          const currentSyncedItems = new Map(
            collection._state.syncedData.entries()
          );
          const newItemsMap = /* @__PURE__ */ new Map();
          newItemsArray.forEach((item) => {
            const key = getKey(item);
            newItemsMap.set(key, item);
          });
          begin();
          currentSyncedItems.forEach((oldItem, key) => {
            const newItem = newItemsMap.get(key);
            if (!newItem) {
              const needToRemove = removeRow(key, hashedQueryKey);
              if (needToRemove) {
                write({ type: `delete`, value: oldItem });
              }
            } else if (!deepEquals(oldItem, newItem)) {
              write({ type: `update`, value: newItem });
            }
          });
          newItemsMap.forEach((newItem, key) => {
            addRow(key, hashedQueryKey);
            if (!currentSyncedItems.has(key)) {
              write({ type: `insert`, value: newItem });
            }
          });
          commit();
          markReady();
        } else if (result.isError) {
          const isNewError = result.errorUpdatedAt !== state.lastErrorUpdatedAt || result.error !== state.lastError;
          if (isNewError) {
            state.lastError = result.error;
            state.errorCount++;
            state.lastErrorUpdatedAt = result.errorUpdatedAt;
          }
          console.error(
            `[QueryCollection] Error observing query ${String(queryKey2)}:`,
            result.error
          );
          markReady();
        }
      };
      return handleQueryResult;
    };
    const isSubscribed = (hashedQueryKey) => {
      return unsubscribes.has(hashedQueryKey);
    };
    const subscribeToQuery = (observer, hashedQueryKey) => {
      if (!isSubscribed(hashedQueryKey)) {
        const cachedQueryKey = hashToQueryKey.get(hashedQueryKey);
        const handleQueryResult = makeQueryResultHandler(cachedQueryKey);
        const unsubscribeFn = observer.subscribe(handleQueryResult);
        unsubscribes.set(hashedQueryKey, unsubscribeFn);
        const currentResult = observer.getCurrentResult();
        if (currentResult.isSuccess || currentResult.isError) {
          handleQueryResult(currentResult);
        }
      }
    };
    const subscribeToQueries = () => {
      state.observers.forEach(subscribeToQuery);
    };
    const unsubscribeFromQueries = () => {
      unsubscribes.forEach((unsubscribeFn) => {
        unsubscribeFn();
      });
      unsubscribes.clear();
    };
    syncStarted = true;
    const unsubscribeFromCollectionEvents = collection.on(
      `subscribers:change`,
      ({ subscriberCount }) => {
        if (subscriberCount > 0) {
          subscribeToQueries();
        } else if (subscriberCount === 0) {
          unsubscribeFromQueries();
        }
      }
    );
    if (syncMode === `eager`) {
      const initialResult = createQueryFromOpts({});
      if (initialResult instanceof Promise) {
        initialResult.catch(() => {
        });
      }
    } else {
      markReady();
    }
    subscribeToQueries();
    state.observers.forEach((observer, hashedQueryKey) => {
      const cachedQueryKey = hashToQueryKey.get(hashedQueryKey);
      const handleQueryResult = makeQueryResultHandler(cachedQueryKey);
      handleQueryResult(observer.getCurrentResult());
    });
    const cleanupQueryInternal = (hashedQueryKey) => {
      unsubscribes.get(hashedQueryKey)?.();
      unsubscribes.delete(hashedQueryKey);
      const rowKeys = queryToRows.get(hashedQueryKey) ?? /* @__PURE__ */ new Set();
      const rowsToDelete = [];
      rowKeys.forEach((rowKey) => {
        const queries = rowToQueries.get(rowKey);
        if (!queries) {
          return;
        }
        queries.delete(hashedQueryKey);
        if (queries.size === 0) {
          rowToQueries.delete(rowKey);
          if (collection.has(rowKey)) {
            rowsToDelete.push(collection.get(rowKey));
          }
        }
      });
      if (rowsToDelete.length > 0) {
        begin();
        rowsToDelete.forEach((row) => {
          write({ type: `delete`, value: row });
        });
        commit();
      }
      state.observers.delete(hashedQueryKey);
      queryToRows.delete(hashedQueryKey);
      hashToQueryKey.delete(hashedQueryKey);
      queryRefCounts.delete(hashedQueryKey);
    };
    const cleanupQueryIfIdle = (hashedQueryKey) => {
      const refcount = queryRefCounts.get(hashedQueryKey) || 0;
      const observer = state.observers.get(hashedQueryKey);
      if (refcount <= 0) {
        unsubscribes.get(hashedQueryKey)?.();
        unsubscribes.delete(hashedQueryKey);
      }
      const hasListeners = observer?.hasListeners() ?? false;
      if (hasListeners) {
        queryRefCounts.set(hashedQueryKey, 0);
        return;
      }
      if (refcount > 0) {
        console.warn(
          `[cleanupQueryIfIdle] Invariant violation: refcount=${refcount} but no listeners. Cleaning up to prevent leak.`,
          { hashedQueryKey }
        );
      }
      cleanupQueryInternal(hashedQueryKey);
    };
    const forceCleanupQuery = (hashedQueryKey) => {
      cleanupQueryInternal(hashedQueryKey);
    };
    const unsubscribeQueryCache = queryClient.getQueryCache().subscribe((event) => {
      const hashedKey = event.query.queryHash;
      if (event.type === `removed`) {
        if (hashToQueryKey.has(hashedKey)) {
          cleanupQueryIfIdle(hashedKey);
        }
      }
    });
    const cleanup = async () => {
      unsubscribeFromCollectionEvents();
      unsubscribeFromQueries();
      const allQueryKeys = [...hashToQueryKey.values()];
      const allHashedKeys = [...state.observers.keys()];
      for (const hashedKey of allHashedKeys) {
        forceCleanupQuery(hashedKey);
      }
      unsubscribeQueryCache();
      await Promise.all(
        allQueryKeys.map(async (qKey) => {
          await queryClient.cancelQueries({ queryKey: qKey, exact: true });
          queryClient.removeQueries({ queryKey: qKey, exact: true });
        })
      );
    };
    const unloadSubset = (options) => {
      const key = generateQueryKeyFromOptions(options);
      const hashedQueryKey = hashKey(key);
      const currentCount = queryRefCounts.get(hashedQueryKey) || 0;
      const newCount = currentCount - 1;
      if (newCount <= 0) {
        queryRefCounts.set(hashedQueryKey, 0);
        cleanupQueryIfIdle(hashedQueryKey);
      } else {
        queryRefCounts.set(hashedQueryKey, newCount);
      }
    };
    const loadSubsetDedupe = syncMode === `eager` ? void 0 : createQueryFromOpts;
    return {
      loadSubset: loadSubsetDedupe,
      unloadSubset: syncMode === `eager` ? void 0 : unloadSubset,
      cleanup
    };
  };
  const refetch = async (opts) => {
    const allQueryKeys = [...hashToQueryKey.values()];
    const refetchPromises = allQueryKeys.map((qKey) => {
      const queryObserver = state.observers.get(hashKey(qKey));
      return queryObserver.refetch({
        throwOnError: opts?.throwOnError
      });
    });
    return Promise.all(refetchPromises);
  };
  const updateCacheDataForKey = (key, items) => {
    if (select) {
      queryClient.setQueryData(key, (oldData) => {
        if (!oldData || typeof oldData !== `object`) {
          return oldData;
        }
        if (Array.isArray(oldData)) {
          return items;
        }
        const selectedArray = select(oldData);
        if (Array.isArray(selectedArray)) {
          for (const propKey of Object.keys(oldData)) {
            if (oldData[propKey] === selectedArray) {
              return { ...oldData, [propKey]: items };
            }
          }
        }
        if (Array.isArray(oldData.data)) {
          return { ...oldData, data: items };
        }
        if (Array.isArray(oldData.items)) {
          return { ...oldData, items };
        }
        if (Array.isArray(oldData.results)) {
          return { ...oldData, results: items };
        }
        for (const propKey of Object.keys(oldData)) {
          if (Array.isArray(oldData[propKey])) {
            return { ...oldData, [propKey]: items };
          }
        }
        return oldData;
      });
    } else {
      queryClient.setQueryData(key, items);
    }
  };
  const updateCacheData = (items) => {
    const activeQueryKeys = Array.from(hashToQueryKey.values());
    if (activeQueryKeys.length > 0) {
      for (const key of activeQueryKeys) {
        updateCacheDataForKey(key, items);
      }
    } else {
      const baseKey = typeof queryKey === `function` ? queryKey({}) : queryKey;
      updateCacheDataForKey(baseKey, items);
    }
  };
  let writeContext = null;
  const enhancedInternalSync = (params) => {
    const { begin, write, commit, collection } = params;
    const contextQueryKey = typeof queryKey === `function` ? queryKey({}) : queryKey;
    writeContext = {
      collection,
      queryClient,
      queryKey: contextQueryKey,
      getKey,
      begin,
      write,
      commit,
      updateCacheData
    };
    return internalSync(params);
  };
  const writeUtils = createWriteUtils(
    () => writeContext
  );
  const wrappedOnInsert = onInsert ? async (params) => {
    const handlerResult = await onInsert(params) ?? {};
    const shouldRefetch = handlerResult.refetch !== false;
    if (shouldRefetch) {
      await refetch();
    }
    return handlerResult;
  } : void 0;
  const wrappedOnUpdate = onUpdate ? async (params) => {
    const handlerResult = await onUpdate(params) ?? {};
    const shouldRefetch = handlerResult.refetch !== false;
    if (shouldRefetch) {
      await refetch();
    }
    return handlerResult;
  } : void 0;
  const wrappedOnDelete = onDelete ? async (params) => {
    const handlerResult = await onDelete(params) ?? {};
    const shouldRefetch = handlerResult.refetch !== false;
    if (shouldRefetch) {
      await refetch();
    }
    return handlerResult;
  } : void 0;
  const utils = new QueryCollectionUtilsImpl(state, refetch, writeUtils);
  return {
    ...baseCollectionConfig,
    getKey,
    syncMode,
    sync: { sync: enhancedInternalSync },
    onInsert: wrappedOnInsert,
    onUpdate: wrappedOnUpdate,
    onDelete: wrappedOnDelete,
    utils
  };
}
export {
  queryCollectionOptions as q
};
