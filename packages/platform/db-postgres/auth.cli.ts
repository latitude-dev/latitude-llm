/**
 * Better Auth config used only by the Better Auth CLI (`better-auth generate`).
 * Keep imports relative — the CLI cannot resolve workspace path aliases.
 *
 * Plugins here must match what `createBetterAuth` registers so generated tables stay in sync.
 *
 * Output `better-auth.schema.reference.ts` is overwritten each run — do not edit it by hand.
 * Port column changes into `src/schema/better-auth.ts` (latitude schema, CUID2, timestamptz, RLS).
 *
 * Regenerate:
 *   pnpm run auth:generate-schema-reference
 *
 * @see https://www.better-auth.com/docs/concepts/cli
 */
import { stripe } from "@better-auth/stripe"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { magicLink, organization } from "better-auth/plugins"
import { drizzle } from "drizzle-orm/node-postgres"
import pg from "pg"
import Stripe from "stripe"

const pool = new pg.Pool({ connectionString: "postgresql://localhost:5432/dummy" })
const db = drizzle(pool)

const stripeClient = new Stripe("sk_test_dummy", { apiVersion: "2026-02-25.clover" })

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg", usePlural: true }),
  emailAndPassword: { enabled: true },
  plugins: [
    organization(),
    magicLink({ sendMagicLink: async () => {} }),
    stripe({
      stripeClient,
      stripeWebhookSecret: "whsec_dummy",
      createCustomerOnSignUp: true,
      subscription: { enabled: true, plans: [] },
      organization: { enabled: true },
    }),
  ],
})
