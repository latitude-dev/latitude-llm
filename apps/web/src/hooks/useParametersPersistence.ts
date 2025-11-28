'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ParameterType } from '@latitude-data/constants'

const DB_NAME = 'latitude-params'
const DB_VERSION = 1
const STORE_NAME = 'manual-params'

export type StoredParameterValue = {
  value: string
  type: ParameterType
  updatedAt: number
}

export type StoredParameters = Record<string, StoredParameterValue>

/**
 * Opens the IndexedDB database, creating the object store if needed.
 */
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

/**
 * Retrieves stored parameters for a specific document from IndexedDB.
 */
async function getStoredParameters(
  documentUuid: string,
): Promise<StoredParameters> {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.get(documentUuid)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || {})
    })
  } catch {
    return {}
  }
}

/**
 * Saves parameters for a specific document to IndexedDB.
 */
async function saveStoredParameters(
  documentUuid: string,
  params: StoredParameters,
): Promise<void> {
  try {
    const db = await openDatabase()
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite')
      const store = transaction.objectStore(STORE_NAME)
      const request = store.put(params, documentUuid)

      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  } catch {
    // Silently fail - persistence is a nice-to-have
  }
}

/**
 * Hook for persisting manual parameter values to IndexedDB.
 * Returns stored values and functions to update them.
 */
export function useParametersPersistence(documentUuid: string | undefined) {
  const [storedParams, setStoredParams] = useState<StoredParameters>({})
  const [isLoaded, setIsLoaded] = useState(false)
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load stored parameters on mount or when documentUuid changes
  useEffect(() => {
    if (!documentUuid) {
      setStoredParams({})
      setIsLoaded(true)
      return
    }

    setIsLoaded(false)
    getStoredParameters(documentUuid).then((params) => {
      setStoredParams(params)
      setIsLoaded(true)
    })
  }, [documentUuid])

  // Debounced save to IndexedDB
  const persistParameters = useCallback(
    (params: StoredParameters) => {
      if (!documentUuid) return

      // Clear any pending save
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }

      // Debounce the save by 500ms
      saveTimeoutRef.current = setTimeout(() => {
        saveStoredParameters(documentUuid, params)
      }, 500)
    },
    [documentUuid],
  )

  // Update a single parameter value
  const updateParameter = useCallback(
    (param: string, value: string, type: ParameterType) => {
      setStoredParams((prev) => {
        const updated = {
          ...prev,
          [param]: {
            value,
            type,
            updatedAt: Date.now(),
          },
        }
        persistParameters(updated)
        return updated
      })
    },
    [persistParameters],
  )

  // Get the stored value for a parameter (if any)
  const getStoredValue = useCallback(
    (param: string): StoredParameterValue | undefined => {
      return storedParams[param]
    },
    [storedParams],
  )

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current)
      }
    }
  }, [])

  return {
    storedParams,
    isLoaded,
    updateParameter,
    getStoredValue,
  }
}
