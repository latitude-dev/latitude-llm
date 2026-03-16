import { e as errorHandler, c as createSsrRpc } from "./middlewares-BgvwNBR1.mjs";
import { g as getAuthIntentInfoInputSchema, c as completeAuthIntentInputSchema, b as createSignupIntentInputSchema, a as createLoginIntentInputSchema } from "./auth.types-BkojwMno.mjs";
import { e as createServerFn } from "./index.mjs";
import { o as object, s as string } from "../_libs/zod.mjs";
const createLoginIntent = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(createLoginIntentInputSchema).handler(createSsrRpc("5506a53b7817322a6e8fef6b712a55a3d7c2eb28baa5343436ab03bc51cb41db"));
const createSignupIntent = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(createSignupIntentInputSchema).handler(createSsrRpc("ff8c666025c47ab10914f26d9b97fe5c3384c75fc291e6396ea48ecd08b8ca62"));
const getAuthIntentInfo = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(getAuthIntentInfoInputSchema).handler(createSsrRpc("b8dd6d04677e4daa7f44940c4957f2e3103d09bec15458a7ec28a0af65d4e775"));
const completeAuthIntent = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(completeAuthIntentInputSchema).handler(createSsrRpc("26a5ca2f2bb514f33f98665d848c7522b29c1d712c6958a1399cb865f08aaadb"));
const exchangeCliSession = createServerFn({
  method: "POST"
}).middleware([errorHandler]).inputValidator(object({
  sessionToken: string()
})).handler(createSsrRpc("271af12fb71876676771a222c21a3dcd6f96caf30f721c37f8a4d51d2374d9f7"));
export {
  createLoginIntent as a,
  completeAuthIntent as b,
  createSignupIntent as c,
  exchangeCliSession as e,
  getAuthIntentInfo as g
};
