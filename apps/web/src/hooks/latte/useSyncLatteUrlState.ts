import {
  AppLocalStorage,
  useLocalStorage,
} from '@latitude-data/web-ui/hooks/useLocalStorage'
import { useLatteStore } from '$/stores/latte'
import { useOnce } from '../useMount'

/**
 * Synchronizes the Latte thread UUID with local storage on mount.
 * Reads the thread UUID from local storage on component mount and updates the store accordingly.
 */
export function useSyncLatteUrlState() {
  const { threadUuid, setThreadUuid } = useLatteStore()
  const { value: storedThreadUuid, setValue: setStoredThreadUuid } =
    useLocalStorage<string | undefined>({
      key: AppLocalStorage.latteThreadUuid,
      defaultValue: undefined,
    })

  useOnce(() => {
    // If `threadUuid` exists and `storedThreadUuid` does not, set the local storage to `threadUuid`
    // If both `threadUuid` and `storedThreadUuid` exist, update the local storage to `threadUuid`
    // If `threadUuid` does not exist but `storedThreadUuid` does, set `threadUuid` to `storedThreadUuid`
    // If neither `threadUuid` nor `storedThreadUuid` exist, do nothing
    if (storedThreadUuid) {
      if (threadUuid) {
        if (threadUuid !== storedThreadUuid) {
          setStoredThreadUuid(threadUuid)
        }
      } else {
        setThreadUuid(storedThreadUuid)
      }
    } else {
      if (threadUuid) {
        setStoredThreadUuid(threadUuid)
      }
    }
  })
}
