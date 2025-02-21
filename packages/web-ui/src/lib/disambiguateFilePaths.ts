export type DisambiguatedFilePath = {
  path: string
  name: string
  context?: string
}

/**
 * This method is used to disambiguate filepaths with repeated names, based on the disambiguation of tab titles from VSCode.
 * This could be done more precise by adding multiple nesting, just like the original implementation in VSCode, but this is a simplified version, which works for most cases.
 */
export function disambiguateFilePaths(
  filepaths: string[],
): DisambiguatedFilePath[] {
  const splitFilepaths = filepaths.map((filepath) => filepath.split('/'))
  return splitFilepaths.reduce((acc: DisambiguatedFilePath[], fileParts, i) => {
    const name = fileParts.at(-1)!

    const filepathsWithRepeatedNames = splitFilepaths.filter(
      (item, j) => i != j && item.at(-1)! === name,
    )
    if (!filepathsWithRepeatedNames.length) {
      acc.push({
        path: fileParts.join('/'),
        name,
      })
      return acc
    }

    for (let j = 1; j <= fileParts.length; j++) {
      const currentContext = fileParts[fileParts.length - 1 - j]!
      if (
        !filepathsWithRepeatedNames.some(
          (item) =>
            item.length - 1 > j && item[item.length - 1 - j] === currentContext,
        )
      ) {
        const isFirst = j === fileParts.length - 1
        const isLast = j === 1
        acc.push({
          path: fileParts.join('/'),
          name,
          context: `${isFirst ? '' : '…/'}${currentContext}${isLast ? '' : '/…'}`,
        })
        return acc
      }
    }

    acc.push({
      path: fileParts.join('/'),
      name,
      context: fileParts.slice(0, fileParts.length - 1).join('/'),
    })
    return acc
  }, [])
}
