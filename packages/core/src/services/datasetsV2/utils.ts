export type HashAlgorithmFn = (len: number) => string
export const buildColumn = <C extends string = string>(hashAlgorithm: HashAlgorithmFn) => (column: C) => {
  return {
    identifier: hashAlgorithm(7),
    name: column,
  }
}
