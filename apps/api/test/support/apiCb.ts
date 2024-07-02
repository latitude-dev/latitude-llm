import { CallbackHandler } from 'supertest'

function apiCb(cb: Function, printErr?: boolean): CallbackHandler {
  return (err: Error, res: unknown) => {
    if (printErr) console.error(err)

    return cb(res)
  }
}

export default apiCb
