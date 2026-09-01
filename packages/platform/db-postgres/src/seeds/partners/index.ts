import { createPartner } from "@domain/partners"
import {
  SEED_PARTNER_ICON_URL,
  SEED_PARTNER_ID,
  SEED_PARTNER_NAME,
  SEED_PARTNER_REDIRECT_URLS,
  SEED_PARTNER_SECRET,
} from "@domain/shared/seeding"
import { Effect } from "effect"
import type { SeedContext, Seeder } from "../types.ts"

/**
 * Registers Longitude — a fictional third-party platform — against the private
 * partner API. The demo server's env defaults match these values, so a seeded
 * stack runs either install path with no configuration.
 */
const seedDemoPartner: Seeder = {
  name: "partners/longitude",
  run: (ctx: SeedContext) =>
    Effect.gen(function* () {
      const partner = createPartner({
        id: SEED_PARTNER_ID,
        name: SEED_PARTNER_NAME,
        iconUrl: SEED_PARTNER_ICON_URL,
        redirectUrls: SEED_PARTNER_REDIRECT_URLS,
        scopes: ["accounts:provision"],
        // No allowlist: local callers have no `X-Forwarded-For`, and the demo must work out of the box.
        allowedIps: [],
      })
      yield* ctx.repositories.partner.save(partner, { hmacSecret: SEED_PARTNER_SECRET })
      console.log(`  -> partner: ${partner.name} (${partner.id})`)
      console.log(`  -> secret: ${SEED_PARTNER_SECRET}`)
    }),
}

export const partnerSeeders: readonly Seeder[] = [seedDemoPartner]
