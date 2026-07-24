import { createPrivateKey } from "node:crypto"
import { Effect } from "effect"
import { SignJWT } from "jose"
import { GithubJwtError } from "./errors.ts"

const APP_JWT_TTL_SECONDS = 600
const CLOCK_DRIFT_SECONDS = 60

/**
 * Signs a short-lived GitHub App JWT (RS256) via `jose`, used to authenticate
 * as the app itself — minting installation tokens and reading installation
 * metadata. `node:crypto`'s `createPrivateKey` parses the PEM first because
 * GitHub downloads a PKCS#1 key (`BEGIN RSA PRIVATE KEY`) that jose's PKCS#8
 * importer won't read; the resulting KeyObject is handed to jose for signing.
 * `iat` is backdated 60s to tolerate clock drift; `exp` is GitHub's 10-minute
 * maximum.
 */
export const signGithubAppJwt = (input: {
  readonly appId: string
  readonly privateKeyPem: string
  readonly nowSeconds?: number
}): Effect.Effect<string, GithubJwtError> =>
  Effect.tryPromise({
    try: async () => {
      const now = input.nowSeconds ?? Math.floor(Date.now() / 1000)
      const key = createPrivateKey(input.privateKeyPem)
      return await new SignJWT({
        iat: now - CLOCK_DRIFT_SECONDS,
        exp: now + APP_JWT_TTL_SECONDS,
        iss: input.appId,
      })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .sign(key)
    },
    catch: (cause) => new GithubJwtError({ cause }),
  })
