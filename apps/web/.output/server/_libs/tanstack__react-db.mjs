import { r as reactExports } from "./react.mjs";
import { B as BaseQueryBuilder, C as CollectionImpl, c as createLiveQueryCollection } from "./tanstack__db.mjs";
const DEFAULT_GC_TIME_MS = 1;
function useLiveQuery(configOrQueryOrCollection, deps = []) {
  const isCollection = configOrQueryOrCollection && typeof configOrQueryOrCollection === `object` && typeof configOrQueryOrCollection.subscribeChanges === `function` && typeof configOrQueryOrCollection.startSyncImmediate === `function` && typeof configOrQueryOrCollection.id === `string`;
  const collectionRef = reactExports.useRef(
    null
  );
  const depsRef = reactExports.useRef(null);
  const configRef = reactExports.useRef(null);
  const versionRef = reactExports.useRef(0);
  const snapshotRef = reactExports.useRef(null);
  const needsNewCollection = !collectionRef.current || isCollection && configRef.current !== configOrQueryOrCollection || !isCollection && (depsRef.current === null || depsRef.current.length !== deps.length || depsRef.current.some((dep, i) => dep !== deps[i]));
  if (needsNewCollection) {
    if (isCollection) {
      const syncMode = configOrQueryOrCollection.config?.syncMode;
      if (syncMode === `on-demand`) {
        console.warn(
          `[useLiveQuery] Warning: Passing a collection with syncMode "on-demand" directly to useLiveQuery will not load any data. In on-demand mode, data is only loaded when queries with predicates request it.

Instead, use a query builder function:
  const { data } = useLiveQuery((q) => q.from({ c: myCollection }).select(({ c }) => c))

Or switch to syncMode "eager" if you want all data to sync automatically.`
        );
      }
      configOrQueryOrCollection.startSyncImmediate();
      collectionRef.current = configOrQueryOrCollection;
      configRef.current = configOrQueryOrCollection;
    } else {
      if (typeof configOrQueryOrCollection === `function`) {
        const queryBuilder = new BaseQueryBuilder();
        const result = configOrQueryOrCollection(queryBuilder);
        if (result === void 0 || result === null) {
          collectionRef.current = null;
        } else if (result instanceof CollectionImpl) {
          result.startSyncImmediate();
          collectionRef.current = result;
        } else if (result instanceof BaseQueryBuilder) {
          collectionRef.current = createLiveQueryCollection({
            query: configOrQueryOrCollection,
            startSync: true,
            gcTime: DEFAULT_GC_TIME_MS
          });
        } else if (result && typeof result === `object`) {
          collectionRef.current = createLiveQueryCollection({
            startSync: true,
            gcTime: DEFAULT_GC_TIME_MS,
            ...result
          });
        } else {
          throw new Error(
            `useLiveQuery callback must return a QueryBuilder, LiveQueryCollectionConfig, Collection, undefined, or null. Got: ${typeof result}`
          );
        }
        depsRef.current = [...deps];
      } else {
        collectionRef.current = createLiveQueryCollection({
          startSync: true,
          gcTime: DEFAULT_GC_TIME_MS,
          ...configOrQueryOrCollection
        });
        depsRef.current = [...deps];
      }
    }
  }
  if (needsNewCollection) {
    versionRef.current = 0;
    snapshotRef.current = null;
  }
  const subscribeRef = reactExports.useRef(null);
  if (!subscribeRef.current || needsNewCollection) {
    subscribeRef.current = (onStoreChange) => {
      if (!collectionRef.current) {
        return () => {
        };
      }
      const subscription = collectionRef.current.subscribeChanges(() => {
        versionRef.current += 1;
        onStoreChange();
      });
      if (collectionRef.current.status === `ready`) {
        versionRef.current += 1;
        onStoreChange();
      }
      return () => {
        subscription.unsubscribe();
      };
    };
  }
  const getSnapshotRef = reactExports.useRef(null);
  if (!getSnapshotRef.current || needsNewCollection) {
    getSnapshotRef.current = () => {
      const currentVersion = versionRef.current;
      const currentCollection = collectionRef.current;
      if (!snapshotRef.current || snapshotRef.current.version !== currentVersion || snapshotRef.current.collection !== currentCollection) {
        snapshotRef.current = {
          collection: currentCollection,
          version: currentVersion
        };
      }
      return snapshotRef.current;
    };
  }
  const snapshot = reactExports.useSyncExternalStore(
    subscribeRef.current,
    getSnapshotRef.current
  );
  const returnedSnapshotRef = reactExports.useRef(null);
  const returnedRef = reactExports.useRef(null);
  if (!returnedSnapshotRef.current || returnedSnapshotRef.current.version !== snapshot.version || returnedSnapshotRef.current.collection !== snapshot.collection) {
    if (!snapshot.collection) {
      returnedRef.current = {
        state: void 0,
        data: void 0,
        collection: void 0,
        status: `disabled`,
        isLoading: false,
        isReady: true,
        isIdle: false,
        isError: false,
        isCleanedUp: false,
        isEnabled: false
      };
    } else {
      const entries = Array.from(snapshot.collection.entries());
      const config = snapshot.collection.config;
      const singleResult = config.singleResult;
      let stateCache = null;
      let dataCache = null;
      returnedRef.current = {
        get state() {
          if (!stateCache) {
            stateCache = new Map(entries);
          }
          return stateCache;
        },
        get data() {
          if (!dataCache) {
            dataCache = entries.map(([, value]) => value);
          }
          return singleResult ? dataCache[0] : dataCache;
        },
        collection: snapshot.collection,
        status: snapshot.collection.status,
        isLoading: snapshot.collection.status === `loading`,
        isReady: snapshot.collection.status === `ready`,
        isIdle: snapshot.collection.status === `idle`,
        isError: snapshot.collection.status === `error`,
        isCleanedUp: snapshot.collection.status === `cleaned-up`,
        isEnabled: true
      };
    }
    returnedSnapshotRef.current = snapshot;
  }
  return returnedRef.current;
}
export {
  useLiveQuery as u
};
