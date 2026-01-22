import { AppLocalStorage, useLocalStorage } from "@latitude-data/web-ui/hooks/useLocalStorage";
import { useCallback, useMemo } from "react";

type CustomMcpHeaders = Record<string, Record<string, string>>;

export function useAllCustomMcpHeaders() {
  const { value, setValue } = useLocalStorage<CustomMcpHeaders>({
    key: AppLocalStorage.customMcpHeaders,
    defaultValue: {},
  })

  return {
    data: value,
    update: setValue,
  }
}

export function useCustomMcpHeaders(integrationName: string) {
  const { data: record, update: updateRecord } = useAllCustomMcpHeaders()

  const data = useMemo(() => record[integrationName] ?? undefined, [record, integrationName])

  const update = useCallback((headers: Record<string, string>) => {
    updateRecord((prev) => ({
      ...prev,
      [integrationName]: headers,
    }))
  }, [updateRecord, integrationName])

  const remove = useCallback(() => {
    updateRecord((prev) => {
      const { [integrationName]: _, ...rest } = prev
      return rest
    })
  }, [updateRecord, integrationName])

  
  return {
    data,
    update,
    remove,
  }
}