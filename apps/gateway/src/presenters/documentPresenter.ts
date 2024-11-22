import { readMetadata } from '@latitude-data/compiler'
import { DocumentVersion } from '@latitude-data/core/browser'
import { scan } from '@latitude-data/promptl'

export async function documentPresenter(document: DocumentVersion) {
  let metadata
  try {
    if (document.promptlVersion === 0) {
      metadata = await readMetadata({ prompt: document.content })
    } else {
      metadata = await scan({ prompt: document.content })
    }
  } catch (err) {
    // do nothing, prompt could have invalid content
  }

  return {
    ...document,
    config: metadata?.config,
  }
}
