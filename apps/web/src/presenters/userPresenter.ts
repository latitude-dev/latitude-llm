import { omit } from 'lodash-es'

import type { User } from '@latitude-data/core/browser'

export default function userPresenter(user: User) {
  return omit(user, 'encryptedPassword')
}
