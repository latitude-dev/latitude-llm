import { readMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'

export async function documentPresenter(document: DocumentVersion) {
  let metadata
  try {
    metadata = await readMetadata({ prompt: document.content })
  } catch (err) {
    // do nothing, prompt could have invalid content
  }

  return {
    ...document,
    config: metadata?.config,
  }
}
