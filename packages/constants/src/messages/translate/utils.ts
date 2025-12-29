export function omitUndefined<T extends object>(obj: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(obj).filter(([_, value]) => value !== undefined),
  ) as Partial<T>
}

export function extract<T extends object>(
  keys: (keyof T)[],
  obj: unknown,
): Partial<T> {
  return Object.fromEntries(
    keys.map((key) => [key, (obj as T)[key]]),
  ) as Partial<T>
}

export function extractValue(keys: string[], obj: unknown): unknown {
  return Object.entries(obj as {}).find(
    ([key, value]) => keys.includes(key) && value !== undefined,
  )?.[1]
}

export function stringify(value: unknown): string {
  if (value === undefined || value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return value.toString()
  if (typeof value === 'boolean') return value.toString()
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

const capitalize = (str: string) =>
  str.charAt(0).toUpperCase() + str.toLowerCase().slice(1)

/**
 * Given a key made out of words separated by spaces, it will return all the possible variations of the key in different cases.
 * @param key - The key to generate variations for.
 * @returns An array of all the possible variations of the key in different cases.
 */
export function caseVariations(key: string): string[] {
  const words = key.toLowerCase().split(' ')

  return [
    // camelCase
    words
      .map((word, index) => (index === 0 ? word : capitalize(word)))
      .join(''),

    // PascalCase
    words.map(capitalize).join(''),

    // snake_case
    words.join('_'),

    // kebab-case
    words.join('-'),

    // UPPER_CASE
    words.join('_').toUpperCase(),
  ]
}
