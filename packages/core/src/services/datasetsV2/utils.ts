export type HashAlgorithmFn = (len: number) => string
export const buildColumn = (hashAlgorithm: HashAlgorithmFn) => (column: string) => {
  return {
    identifier: hashAlgorithm(7),
    name: column,
  }
}
