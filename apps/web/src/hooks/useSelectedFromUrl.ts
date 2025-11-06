import { useCallback, useMemo, useState } from 'react'
import { useSearchParams } from 'next/navigation'

function handleSelectChange<E extends Record<string, any>, K extends keyof E>({
  element,
  keyField,
  paramsUrlName,
  searchParams,
}: {
  element: E | undefined
  keyField: K
  paramsUrlName: string
  searchParams: URLSearchParams
}) {
  const newSearchParams = new URLSearchParams(searchParams.toString())

  if (element) {
    newSearchParams.set(paramsUrlName, String(element[keyField]))
  } else {
    newSearchParams.delete(paramsUrlName)
  }

  const newUrl = `?${newSearchParams.toString()}`
  const currentUrl = `?${searchParams.toString()}`

  if (newUrl !== currentUrl) {
    window.history.replaceState(null, '', newUrl)
  }
}

/**
 * Custom hook for managing selected element state with URL synchronization.
 *
 * The property used in the URL (defined by `keyField`) must exist in E.
 */
export function useSelectedFromUrl<
  E extends Record<string, any>,
  K extends keyof E,
>({
  serverSelected,
  keyField,
  paramsUrlName,
}: {
  serverSelected?: E
  keyField: K
  paramsUrlName: string
}) {
  const searchParams = useSearchParams()
  const [selectedElement, setSelectedElement] = useState<E | undefined>(
    serverSelected,
  )

  const onSelectChange = useCallback(
    (element: E | undefined) => {
      setSelectedElement(element)
      handleSelectChange({
        element,
        keyField,
        paramsUrlName,
        searchParams,
      })
    },
    [searchParams, keyField, paramsUrlName],
  )
  return useMemo(
    () => ({
      selectedElement,
      onSelectChange,
    }),
    [selectedElement, onSelectChange],
  )
}
