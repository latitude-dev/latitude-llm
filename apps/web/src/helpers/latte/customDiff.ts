import DiffMatchPatch from 'diff-match-patch'

export enum CustomDiffType {
  EQUAL = 0,
  INSERT = 1,
  DELETE = -1,
  REPLACE = 2, // Combination of delete and insert
}

type ICustomDiffAction = {
  type: CustomDiffType
  length: number
}

interface CustomDiffEqual extends ICustomDiffAction {
  type: CustomDiffType.EQUAL
  length: number
}

interface CustomDiffInsert extends ICustomDiffAction {
  type: CustomDiffType.INSERT
  text: string
}

interface CustomDiffReplace extends ICustomDiffAction {
  type: CustomDiffType.REPLACE
  text: string
}

interface CustomDiffDelete extends ICustomDiffAction {
  type: CustomDiffType.DELETE
  length: number
}

type CustomDiffAction = CustomDiffEqual | CustomDiffInsert | CustomDiffDelete | CustomDiffReplace

const dmp = new DiffMatchPatch()

function combineDeleteAndInsert(
  deleteText: string, // Assume deleteAction is of type DiffMatchPatch.DIFF_INSERT
  insertText: string, // Assume insertAction is of type DiffMatchPatch.DIFF_DELETE
): CustomDiffAction[] {
  const actions: CustomDiffAction[] = []

  if (deleteText.length > insertText.length) {
    actions.push({
      type: CustomDiffType.DELETE,
      length: deleteText.length - insertText.length,
    })
  }

  actions.push({
    type: CustomDiffType.REPLACE,
    text: insertText.substring(0, deleteText.length),
    length: Math.min(deleteText.length, insertText.length),
  })

  if (insertText.length > deleteText.length) {
    actions.push({
      type: CustomDiffType.INSERT,
      text: insertText.substring(deleteText.length),
      length: insertText.length - deleteText.length,
    })
  }

  return actions
}

export function customDiff(oldValue: string, newValue: string): CustomDiffAction[] {
  const diffs = dmp.diff_main(oldValue, newValue)
  dmp.diff_cleanupEfficiency(diffs)

  const customDiffs: CustomDiffAction[] = []
  for (let i = 0; i < diffs.length - 1; i++) {
    const [op, text] = diffs[i]!

    // If this diff is a delete and the next one is an insert,
    // we can combine them into a replace action
    if (op === DiffMatchPatch.DIFF_DELETE && i + 1 < diffs.length) {
      const [nextOp, nextText] = diffs[i + 1]!

      if (nextOp === DiffMatchPatch.DIFF_INSERT) {
        customDiffs.push(...combineDeleteAndInsert(text, nextText))

        i++ // Skip the next diff since we already processed it
        continue
      }
    }

    if (op === DiffMatchPatch.DIFF_INSERT) {
      customDiffs.push({
        type: CustomDiffType.INSERT,
        text,
        length: text.length,
      })
    } else if (op === DiffMatchPatch.DIFF_DELETE) {
      customDiffs.push({ type: CustomDiffType.DELETE, length: text.length })
    } else {
      customDiffs.push({ type: CustomDiffType.EQUAL, length: text.length })
    }
  }

  return customDiffs
}
