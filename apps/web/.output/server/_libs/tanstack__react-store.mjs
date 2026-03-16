import { r as reactExports } from "./react.mjs";
import { w as withSelectorExports } from "./use-sync-external-store.mjs";
function defaultCompare(a, b) {
  return a === b;
}
function useStore(atom, selector, compare = defaultCompare) {
  const subscribe = reactExports.useCallback(
    (handleStoreChange) => {
      if (!atom) {
        return () => {
        };
      }
      const { unsubscribe } = atom.subscribe(handleStoreChange);
      return unsubscribe;
    },
    [atom]
  );
  const boundGetSnapshot = reactExports.useCallback(() => atom?.get(), [atom]);
  const selectedSnapshot = withSelectorExports.useSyncExternalStoreWithSelector(
    subscribe,
    boundGetSnapshot,
    boundGetSnapshot,
    selector,
    compare
  );
  return selectedSnapshot;
}
export {
  useStore as u
};
