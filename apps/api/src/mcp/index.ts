// Transitional shim while route modules migrate into @repo/operations — the
// unmoved modules keep importing `defineApiEndpoint` from here. Folded away
// once every module lives in the package.
export { collectToolDescriptors, defineOperation as defineApiEndpoint } from "@repo/operations"
export { registerMcpRoute } from "./server.ts"
