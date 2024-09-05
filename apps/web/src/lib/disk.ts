import path from 'path'
import { fileURLToPath } from 'url'

import { DiskWrapper } from '@latitude-data/core/lib/disk'

const PUBLIC_PATH = 'uploads'
const DIRNAME_PATH = path.dirname(fileURLToPath(import.meta.url))

export default new DiskWrapper({
  local: {
    publicPath: PUBLIC_PATH,
    location: path.join(DIRNAME_PATH, `../../public/${PUBLIC_PATH}`),
  },
})
