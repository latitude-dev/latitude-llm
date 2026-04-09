/** Customer emails for the Support Agent's user_id pool */
export const CUSTOMER_EMAILS: readonly string[] = [
  "wile.e.coyote@gmail.com",
  "yosemite.sam@yahoo.com",
  "daffy.d@gmail.com",
  "elmer.fudd@hotmail.com",
  "taz@mail.com",
  "sylvester.cat@outlook.com",
  "marvin@mars-colony.io",
  "tweety_b@birdmail.net",
  "bugs@whatsup.doc",
  "p.pig@porkymail.com",
]

/** Employee emails for internal agents (Knowledge Assistant, Copywriter, Safety Reviewer) */
export const EMPLOYEE_EMAILS: readonly string[] = [
  "foghorn.l@acme.com",
  "pepe.lp@acme.com",
  "granny@acme.com",
  "speedy.g@acme.com",
]

/** Metadata value pools */
export const SDK_VERSIONS = ["1.2.0", "1.3.1", "2.0.0-beta"] as const
export const REGIONS = ["us-desert-southwest", "us-mountain-west", "mars-colony-1", "eu-west-1"] as const
export const PRODUCT_CATEGORIES = [
  "explosives",
  "propulsion",
  "traps",
  "disguises",
  "construction",
  "miscellaneous",
] as const
export const CUSTOMER_TIERS = ["super-genius", "standard", "premium", "employee"] as const
export const CHANNELS = ["web", "mobile", "api", "smoke-signal"] as const
