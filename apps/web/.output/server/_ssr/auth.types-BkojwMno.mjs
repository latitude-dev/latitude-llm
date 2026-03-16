import { o as object, s as string } from "../_libs/zod.mjs";
const createLoginIntentInputSchema = object({
  email: string()
});
const createSignupIntentInputSchema = object({
  name: string(),
  email: string(),
  organizationName: string()
});
const completeAuthIntentInputSchema = object({
  intentId: string(),
  name: string().optional()
});
const getAuthIntentInfoInputSchema = object({
  intentId: string()
});
export {
  createLoginIntentInputSchema as a,
  createSignupIntentInputSchema as b,
  completeAuthIntentInputSchema as c,
  getAuthIntentInfoInputSchema as g
};
