'use client'

import { useCallback } from 'react'

import { create, StateCreator } from 'zustand'
import { persist, PersistOptions } from 'zustand/middleware'

import { ReactStateDispatch, SetStateAction } from '../commonTypes'

export enum AppLocalStorage {
  colorTheme = 'latitudeColorTheme',
  editorLineNumbers = 'editorLineNumbers',
  editorWrapText = 'editorWrapText',
  editorMinimap = 'editorMinimap',
  editorAutoClosingTags = 'editorAutoClosingTags',
  editorCopilot = 'editorCopilot',
  playgroundParameters = 'playgroundParameters',
  evaluationPlaygroundParameters = 'evaluationPlaygroundParameters',
  playgroundActions = 'playgroundActions',
  chatDebugMode = 'chatDebugMode',
  latteThread = 'latteThread',
  latteSidebarWidth = 'latteSidebarWidth',
  promptEngineeringOnboardingState = 'promptEngineeringOnboardingState',
}

export const isLocalStorageAvailable = (() => {
  try {
    const testKey = '__test__'
    localStorage.setItem(testKey, testKey)
    localStorage.removeItem(testKey)
    return true
  } catch (e) {
    return false
  }
})()

export function buildKey(key: AppLocalStorage): string {
  return `latitude:${key}`
}

export function getStorageValue(key: string, defaultValue: unknown) {
  if (!isLocalStorageAvailable) return defaultValue

  try {
    const saved = localStorage.getItem(key)
    if (saved == 'undefined') return undefined
    return saved ? JSON.parse(saved) : defaultValue
  } catch {
    return defaultValue
  }
}

type LocalStorageStore = {
  values: Partial<Record<string, unknown>>
  setValue: (key: string, value: unknown, defaultValue?: unknown) => void
}

type LocalStorageStorePersist = (
  config: StateCreator<LocalStorageStore>,
  options: PersistOptions<LocalStorageStore>,
) => StateCreator<LocalStorageStore>

const useLocalStorageStore = create<LocalStorageStore>(
  (persist as LocalStorageStorePersist)(
    (set) => ({
      values: {},
      setValue: (key: string, value: unknown, defaultValue?: unknown) => {
        if (typeof value === 'function') {
          value = value(getStorageValue(key, defaultValue))
        }

        if (isLocalStorageAvailable) {
          try {
            localStorage.setItem(key, JSON.stringify(value))
          } catch {
            // Do nothing, if too large or localStorage is not available
          }
        }

        set((state) => ({
          values: {
            ...state.values,
            [key]: value,
          },
        }))
      },
    }),
    {
      name: 'local-storage-store',
      storage: {
        getItem: (name) => {
          const value = localStorage.getItem(name)
          return value ? JSON.parse(value) : null
        },
        setItem: (name, value) => {
          try {
            localStorage.setItem(name, JSON.stringify(value))
          } catch (_) {
            // Do nothing, localStorage is not available or user is trying to set a value that is too large
          }
        },
        removeItem: (name) => {
          localStorage.removeItem(name)
        },
      },
    },
  ),
)

type Props<T> = {
  key: AppLocalStorage
  defaultValue: T
}
type ReturnType<T> = {
  value: T
  setValue: ReactStateDispatch<T>
}
export const useLocalStorage = <T>({
  key,
  defaultValue,
}: Props<T>): ReturnType<T> => {
  const fullKey = buildKey(key)
  const { value, setValue } = useLocalStorageStore((state) => {
    if (!(fullKey in state.values)) {
      // Initialize
      state.values[fullKey] = getStorageValue(fullKey, defaultValue)
    }
    return {
      value: state.values[fullKey] as T,
      setValue: state.setValue,
    }
  })

  return {
    value,
    setValue: useCallback(
      (newValue: SetStateAction<T>) => {
        setValue(fullKey, newValue, defaultValue)
      },
      [setValue, fullKey, defaultValue],
    ),
  }
}
