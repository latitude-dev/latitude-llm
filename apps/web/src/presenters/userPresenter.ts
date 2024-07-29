import { omit } from 'lodash-es'

import { User } from '@latitude-data/core'

export default function userPresenter(user: User) {
  return omit(user, 'encryptedPassword')
}
