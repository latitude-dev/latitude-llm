'use client'

import { useCallback, useEffect, useState } from 'react'

export type RecentSearchItem = {
  type: 'user' | 'workspace' | 'project'
  id: string | number
  label: string
  sublabel?: string
  visitedAt: number
}

const STORAGE_KEY = 'backoffice-recent-searches'
const MAX_RECENT_ITEMS = 15

function getStoredItems(): RecentSearchItem[] {
  if (typeof window === 'undefined') return []

  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (!stored) return []
    return JSON.parse(stored)
  } catch {
    return []
  }
}

function setStoredItems(items: RecentSearchItem[]) {
  if (typeof window === 'undefined') return

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // Ignore storage errors
  }
}

export function useRecentSearches() {
  const [recentItems, setRecentItems] = useState<RecentSearchItem[]>([])

  useEffect(() => {
    setRecentItems(getStoredItems())
  }, [])

  const addRecentItem = useCallback(
    (item: Omit<RecentSearchItem, 'visitedAt'>) => {
      setRecentItems((prev) => {
        const newItem: RecentSearchItem = {
          ...item,
          visitedAt: Date.now(),
        }

        const filtered = prev.filter(
          (existing) =>
            !(existing.type === item.type && existing.id === item.id),
        )

        const updated = [newItem, ...filtered].slice(0, MAX_RECENT_ITEMS)
        setStoredItems(updated)
        return updated
      })
    },
    [],
  )

  const removeRecentItem = useCallback(
    (type: RecentSearchItem['type'], id: string | number) => {
      setRecentItems((prev) => {
        const updated = prev.filter(
          (item) => !(item.type === type && item.id === id),
        )
        setStoredItems(updated)
        return updated
      })
    },
    [],
  )

  const clearRecentItems = useCallback(() => {
    setRecentItems([])
    setStoredItems([])
  }, [])

  const getFilteredItems = useCallback(
    (filterType?: 'user' | 'workspace' | 'project') => {
      if (!filterType) return recentItems
      return recentItems.filter((item) => item.type === filterType)
    },
    [recentItems],
  )

  return {
    recentItems,
    addRecentItem,
    removeRecentItem,
    clearRecentItems,
    getFilteredItems,
  }
}
