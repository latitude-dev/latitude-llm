import { camelCase } from 'lodash-es'

type CamelCaseString<S> = S extends `${infer T}_${infer U}`
  ? `${T}${Capitalize<CamelCaseString<U>>}`
  : S

type CamelCasedProperties<T> = {
  [K in keyof T as K extends string
    ? CamelCaseString<K>
    : K]: T[K] extends Record<string, unknown>
    ? CamelCasedProperties<T[K]>
    : T[K] extends Array<infer U>
      ? Array<CamelCasedProperties<U>>
      : T[K]
}

function isObject(obj: unknown): obj is Record<string, unknown> {
  return typeof obj === 'object' && obj !== null && !Array.isArray(obj)
}

export function toCamelCaseDeep<T>(obj: unknown): CamelCasedProperties<T> {
  if (Array.isArray(obj)) {
    return obj.map(toCamelCaseDeep) as CamelCasedProperties<T>
  }

  if (isObject(obj)) {
    return Object.entries(obj).reduce(
      (acc, [key, value]) => {
        const camelKey = camelCase(key)
        acc[camelKey] = toCamelCaseDeep(value)
        return acc
      },
      {} as Record<string, unknown>,
    ) as CamelCasedProperties<T>
  }

  return obj as CamelCasedProperties<T>
}
