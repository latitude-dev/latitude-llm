import { REDACTION_ENTITIES, type RedactionEntity } from "@domain/shared"
import { describe, expect, it } from "vitest"
import { findRedactionMatches } from "./detectors.ts"
import { resolveOverlaps } from "./redact-text.ts"

/**
 * Measured accuracy of the deterministic detectors, asserted case by case.
 *
 * Every row states the outcome the engine produces today, including the ones that are wrong:
 * `missed` means the value is stored verbatim, `partial` means a residue survives next to the
 * placeholder. Closing a gap therefore fails this suite until the row and the pinned counts below are
 * updated, and so does an accidental regression. That is the point: the numbers only move deliberately.
 *
 * `labelledAs` records a match that lands under the wrong entity. The content is still removed, so it is
 * not a leak, but the placeholder lies about what was there.
 *
 * Card and IBAN values are the networks' and registries' published test values, which belong to no
 * cardholder and exist to be used as fixtures.
 */

const ALL_ENTITIES: ReadonlySet<RedactionEntity> = new Set(REDACTION_ENTITIES)

/**
 * Every credential fixture here is fabricated, but it has to carry the real shape or it tests nothing — and
 * that shape is what secret scanners match. Splitting prefix from body leaves no contiguous token-shaped
 * literal in the file, which keeps push protection off this repository and off anyone's fork.
 */
const vendorToken = (prefix: string, body: string): string => prefix + body

const AWS_ACCESS_KEY_ID = vendorToken("AKIA", "IOSFODNN7EXAMPLE")
const GOOGLE_API_KEY = vendorToken("AIzaSy", "D9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ")
const GITHUB_TOKEN = vendorToken("ghp_", "9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0oKl")
const HUGGINGFACE_TOKEN = vendorToken("hf_", "9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0o")
const NPM_TOKEN = vendorToken("npm_", "9aZq1LmT4vBn7XkR2wEs8YuC3PdF6Hg")
const GOOGLE_OAUTH_TOKEN = vendorToken("ya29.", "a0AfB_byC9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0oKl5MiQ1AbZ")
const OPENAI_KEY = vendorToken("sk-proj-", "9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0oKl5MiQ1AbZ7NcV")
const SLACK_BOT_TOKEN = vendorToken("xoxb-", "2143214321-4321432143214-AbCdEfGhIjKlMnOpQrStUvWx")
const STRIPE_SECRET_KEY = vendorToken("sk_live_", "51H9aZq1LmT4vBn7XkR2wEs8Yu")
const SENDGRID_KEY = vendorToken("SG.", "9aZq1LmT4vBn7XkR2wEs8Y.YuC3PdF6HgJ0oKl5MiQ1AbZ7NcVtR3sYuI9oPl2KmNb")
const GITLAB_TOKEN = vendorToken("glpat-", "9aZq1LmT4vBn7XkR2wEs")
const SLACK_WEBHOOK_URL = vendorToken(
  "https://hooks.slack.com/services/",
  "T00000000/B00000000/XXXXXXXXXXXXXXXXXXXXXXXX",
)

type Outcome = "redacted" | "partial" | "missed"

interface PiiCase {
  readonly id: string
  readonly entity: RedactionEntity
  readonly outcome: Outcome
  readonly text: string
  readonly value: string
  readonly labelledAs?: RedactionEntity
  readonly note?: string
}

interface Observation {
  readonly outcome: Outcome
  readonly labels: readonly RedactionEntity[]
}

const observe = (text: string, value: string): Observation => {
  const start = text.indexOf(value)
  if (start === -1) throw new Error(`corpus error: "${value}" does not occur in the case text`)
  const end = start + value.length

  const accepted = resolveOverlaps(findRedactionMatches(text, ALL_ENTITIES))
  const hits = accepted.filter((match) => match.start < end && start < match.end)
  if (hits.length === 0) return { outcome: "missed", labels: [] }

  const labels = [...new Set(hits.map((hit) => hit.entity))]
  const fullyCovered = hits.some((hit) => hit.start <= start && hit.end >= end)

  return { outcome: fullyCovered ? "redacted" : "partial", labels }
}

const CHAT = [
  "user: Hi, I'm Maria Gonzalez. My order #A-99321 never arrived.",
  "assistant: I can help. Can you confirm the email and phone on the account?",
  "user: maria.gonzalez@gmail.com and +1-415-555-2671. The card was the Visa ending in 4242.",
  "assistant: Thanks. I see the charge on 4111 1111 1111 1111 from Jan 15.",
  "user: My address is 1842 Willow Creek Rd, Austin TX 78704 if that helps.",
].join("\n")

const SQL_TABLE = [
  "| id | email | phone | last_ip |",
  "|----|-------|-------|---------|",
  "| 1 | a.chen@corp.io | 415-555-2671 | 203.0.113.42 |",
  "| 2 | b.patel@corp.io | (628) 555-0199 | 198.51.100.7 |",
].join("\n")

const TOOL_JSON = JSON.stringify({
  customer: {
    contact: { email: "erik.olsen@nordic.se", mobile: "+46 70 123 45 67" },
    payment: { iban: "NL91ABNA0417164300", card_last4: "4444" },
  },
  audit: { source_ip: "192.168.10.4", session: "eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.QWxhZGRpbjpvcGVuc2VzYW1l" },
})

const STACK_TRACE = [
  "Error: connect ECONNREFUSED 127.0.0.1:5432",
  "    at TCPConnectWrap.afterConnect (node:net:1595:16)",
  "  dsn: 'postgres://app:Sup3rS3cret@127.0.0.1:5432/app'",
].join("\n")

const K8S_SECRET = [
  "apiVersion: v1",
  "kind: Secret",
  "data:",
  "  DATABASE_PASSWORD: aHVudGVyMkNvcnJlY3RIb3JzZQ==",
  "  STRIPE_KEY: c2tfbGl2ZV81MUg5YVpxMUxtVDR2Qm43WGtSMndFczhZdQ==",
].join("\n")

const VCARD = [
  "BEGIN:VCARD",
  "FN:Yuki Tanaka",
  "TEL;TYPE=cell:+81 90 1234 5678",
  "EMAIL:yuki.tanaka@example.jp",
  "END:VCARD",
].join("\n")

const EMAIL_CASES: readonly PiiCase[] = [
  {
    id: "email-plain",
    entity: "email",
    outcome: "redacted",
    text: "Please contact john.doe@acme.com about invoice 4471.",
    value: "john.doe@acme.com",
  },
  {
    id: "email-plus-tag",
    entity: "email",
    outcome: "redacted",
    text: "Billing goes to sarah+billing@sub.example.co.uk monthly.",
    value: "sarah+billing@sub.example.co.uk",
  },
  {
    id: "email-json",
    entity: "email",
    outcome: "redacted",
    text: '{"user":{"email":"jane_doe99@gmail.com","plan":"pro"}}',
    value: "jane_doe99@gmail.com",
  },
  {
    id: "email-mailto",
    entity: "email",
    outcome: "redacted",
    text: "Escalate via mailto:bob@corp.io if unresolved.",
    value: "bob@corp.io",
  },
  {
    id: "email-uppercase",
    entity: "email",
    outcome: "redacted",
    text: "Ticket opened by JOHN@ACME.COM at 09:12.",
    value: "JOHN@ACME.COM",
  },
  {
    id: "email-list-first",
    entity: "email",
    outcome: "redacted",
    text: "cc: a.one@beta.com,c.two@delta.org",
    value: "a.one@beta.com",
  },
  {
    id: "email-list-second",
    entity: "email",
    outcome: "redacted",
    text: "cc: a.one@beta.com,c.two@delta.org",
    value: "c.two@delta.org",
  },
  {
    id: "email-sentence-final",
    entity: "email",
    outcome: "redacted",
    text: "Write to sam@corp.com.",
    value: "sam@corp.com",
  },
  {
    id: "email-long-tld",
    entity: "email",
    outcome: "redacted",
    text: "Archive requests: curator@really-long-subdomain.example.museum",
    value: "curator@really-long-subdomain.example.museum",
  },
  {
    id: "email-unicode-local",
    entity: "email",
    outcome: "redacted",
    text: "Cliente: María.García@empresa.es solicita la factura.",
    value: "María.García@empresa.es",
    note: "a non-ASCII local part must be matched whole, or the name it identifies is stored",
  },
  {
    id: "email-apostrophe-local",
    entity: "email",
    outcome: "redacted",
    text: "Counsel is O'Brien.Sean@law.firm on this matter.",
    value: "O'Brien.Sean@law.firm",
    note: "the apostrophe is RFC-legal and part of the local part",
  },
  {
    id: "email-ip-domain",
    entity: "email",
    outcome: "partial",
    text: "Root mail goes to admin@192.168.1.10 on that box.",
    value: "admin@192.168.1.10",
    labelledAs: "ip_address",
    note: "the domain is an IP, so only the ip_address detector fires and admin@ survives",
  },
  {
    id: "email-percent-encoded",
    entity: "email",
    outcome: "redacted",
    text: "Reset link: https://app.com/reset?email=sam%40corp.com&t=9",
    value: "sam%40corp.com",
    note: "how a reset link carries an address, and how agent tool output usually holds one",
  },
  {
    id: "email-obfuscated-at",
    entity: "email",
    outcome: "missed",
    text: "You can reach me at sam(at)corp(dot)com if email fails.",
    value: "sam(at)corp(dot)com",
    note: "deliberate obfuscation, out of reach of a value pattern",
  },
]

const PHONE_CASES: readonly PiiCase[] = [
  {
    id: "phone-e164-us",
    entity: "phone",
    outcome: "redacted",
    text: "SMS sent to +14155552671 at 10:04 UTC",
    value: "+14155552671",
  },
  {
    id: "phone-e164-br",
    entity: "phone",
    outcome: "redacted",
    text: "WhatsApp: +5511987654321 (preferred)",
    value: "+5511987654321",
  },
  {
    id: "phone-nanp-dashes",
    entity: "phone",
    outcome: "redacted",
    text: "Call the customer back on 415-555-2671 today",
    value: "415-555-2671",
  },
  {
    id: "phone-nanp-parens",
    entity: "phone",
    outcome: "redacted",
    text: "Primary line (415) 555-2671, secondary unavailable",
    value: "(415) 555-2671",
  },
  {
    id: "phone-nanp-dots",
    entity: "phone",
    outcome: "redacted",
    text: "Fax to 415.555.2671 before noon",
    value: "415.555.2671",
  },
  {
    id: "phone-nanp-spaces",
    entity: "phone",
    outcome: "redacted",
    text: "Tel: 555 867 5309 (home)",
    value: "555 867 5309",
  },
  {
    id: "phone-e164-spaced-country",
    entity: "phone",
    outcome: "redacted",
    text: "Call me at +1 415 555 2671 tomorrow",
    value: "+1 415 555 2671",
    note: "must be matched whole, not from the area code onwards",
  },
  {
    id: "phone-e164-dashed-country",
    entity: "phone",
    outcome: "redacted",
    text: "Direct dial +1-415-555-2671 during business hours",
    value: "+1-415-555-2671",
    note: "the most common written form in North America",
  },
  {
    id: "phone-dotted-country",
    entity: "phone",
    outcome: "redacted",
    text: "Support desk +1.415.555.2671 x220",
    value: "+1.415.555.2671",
  },
  {
    id: "phone-uk-spaced",
    entity: "phone",
    outcome: "redacted",
    text: "London office: +44 20 7183 8750",
    value: "+44 20 7183 8750",
  },
  {
    id: "phone-es-spaced",
    entity: "phone",
    outcome: "redacted",
    text: "Móvil del cliente: +34 600 123 456",
    value: "+34 600 123 456",
  },
  {
    id: "phone-in-spaced",
    entity: "phone",
    outcome: "redacted",
    text: "Reachable on +91 98765 43210 via WhatsApp",
    value: "+91 98765 43210",
  },
  {
    id: "phone-uk-national",
    entity: "phone",
    outcome: "missed",
    text: "Mobile 07700 900123, landline unavailable",
    value: "07700 900123",
  },
  {
    id: "phone-fr-pairs",
    entity: "phone",
    outcome: "missed",
    text: "Numéro du client : 06 12 34 56 78",
    value: "06 12 34 56 78",
  },
  {
    id: "phone-idd-prefix",
    entity: "phone",
    outcome: "missed",
    text: "Dial 00 44 20 7183 8750 from the hotel phone",
    value: "00 44 20 7183 8750",
  },
  {
    id: "phone-bare-ten",
    entity: "phone",
    outcome: "missed",
    text: '{"phone":"4155552671","country":"US"}',
    value: "4155552671",
    note: "bare ten digits are indistinguishable from a numeric id; excluded on purpose",
  },
  {
    id: "phone-sentence-final",
    entity: "phone",
    outcome: "redacted",
    text: "You can reach the customer at 415-555-2671.",
    value: "415-555-2671",
    note: "a sentence period must not disable the detector",
  },
]

const CARD_CASES: readonly PiiCase[] = [
  {
    id: "card-visa-compact",
    entity: "credit_card",
    outcome: "redacted",
    text: "Charged card 4111111111111111 for $42.00",
    value: "4111111111111111",
  },
  {
    id: "card-visa-spaced",
    entity: "credit_card",
    outcome: "redacted",
    text: "Card on file: 4111 1111 1111 1111, exp 12/26",
    value: "4111 1111 1111 1111",
  },
  {
    id: "card-visa-dashed",
    entity: "credit_card",
    outcome: "redacted",
    text: "Customer read out 4111-1111-1111-1111 aloud",
    value: "4111-1111-1111-1111",
  },
  {
    id: "card-visa-13",
    entity: "credit_card",
    outcome: "redacted",
    text: "Legacy 13-digit Visa 4222222222222 on the account",
    value: "4222222222222",
  },
  {
    id: "card-visa-alt",
    entity: "credit_card",
    outcome: "redacted",
    text: 'payload: {"pan":"4012888888881881"}',
    value: "4012888888881881",
  },
  {
    id: "card-mastercard",
    entity: "credit_card",
    outcome: "redacted",
    text: "Mastercard 5555555555554444 authorised",
    value: "5555555555554444",
  },
  {
    id: "card-mastercard-2series",
    entity: "credit_card",
    outcome: "redacted",
    text: "New BIN range card 2223003122003222 processed",
    value: "2223003122003222",
  },
  {
    id: "card-amex-compact",
    entity: "credit_card",
    outcome: "redacted",
    text: "Amex 378282246310005 used for the deposit",
    value: "378282246310005",
  },
  {
    id: "card-amex-grouped",
    entity: "credit_card",
    outcome: "redacted",
    text: "Amex on file 3782 822463 10005 expires soon",
    value: "3782 822463 10005",
  },
  {
    id: "card-discover",
    entity: "credit_card",
    outcome: "redacted",
    text: "Discover 6011111111111117 declined twice",
    value: "6011111111111117",
  },
  {
    id: "card-jcb",
    entity: "credit_card",
    outcome: "redacted",
    text: "JCB 3530111333300000 accepted in JP",
    value: "3530111333300000",
  },
  {
    id: "card-diners-grouped",
    entity: "credit_card",
    outcome: "redacted",
    text: "Diners grouped 3056 930902 5904 on the receipt",
    value: "3056 930902 5904",
  },
  {
    id: "card-parens",
    entity: "credit_card",
    outcome: "redacted",
    text: "Primary (4111111111111111) and no backup on file",
    value: "4111111111111111",
  },
  {
    id: "card-followed-by-cvv",
    entity: "credit_card",
    outcome: "redacted",
    text: "4111111111111111 123 12/26",
    value: "4111111111111111",
  },
  {
    id: "card-sentence-final",
    entity: "credit_card",
    outcome: "redacted",
    text: "My card number is 4111111111111111.",
    value: "4111111111111111",
    note: "the most natural way a person types a card into a chat",
  },
  {
    id: "card-spaced-sentence-final",
    entity: "credit_card",
    outcome: "redacted",
    text: "The number on the card is 4111 1111 1111 1111.",
    value: "4111 1111 1111 1111",
  },
  {
    id: "card-slash-separated",
    entity: "credit_card",
    outcome: "redacted",
    text: "Handwritten as 4111/1111/1111/1111 on the form",
    value: "4111/1111/1111/1111",
  },
  {
    id: "card-maestro",
    entity: "credit_card",
    outcome: "redacted",
    text: "Maestro 6759649826438453 used at the terminal",
    value: "6759649826438453",
    note: "Luhn-valid, and the Maestro prefix ranges are in the allowlist now",
  },
  {
    id: "card-unionpay",
    entity: "credit_card",
    outcome: "redacted",
    text: "UnionPay 6212345678901232 charged in CNY",
    value: "6212345678901232",
  },
]

const IBAN_CASES: readonly PiiCase[] = [
  {
    id: "iban-de-compact",
    entity: "iban",
    outcome: "redacted",
    text: "Transfer to DE89370400440532013000 by Friday",
    value: "DE89370400440532013000",
  },
  {
    id: "iban-de-grouped",
    entity: "iban",
    outcome: "redacted",
    text: "IBAN: DE89 3704 0044 0532 0130 00 (Deutsche Bank)",
    value: "DE89 3704 0044 0532 0130 00",
  },
  {
    id: "iban-gb-compact",
    entity: "iban",
    outcome: "redacted",
    text: "Beneficiary GB82WEST12345698765432 confirmed",
    value: "GB82WEST12345698765432",
  },
  {
    id: "iban-fr",
    entity: "iban",
    outcome: "redacted",
    text: "Virement vers FR1420041010050500013M02606 effectué",
    value: "FR1420041010050500013M02606",
  },
  {
    id: "iban-es",
    entity: "iban",
    outcome: "redacted",
    text: "Cuenta ES9121000418450200051332 de la nómina",
    value: "ES9121000418450200051332",
  },
  {
    id: "iban-nl",
    entity: "iban",
    outcome: "redacted",
    text: "Rekening NL91ABNA0417164300 is geverifieerd",
    value: "NL91ABNA0417164300",
  },
  {
    id: "iban-be-short",
    entity: "iban",
    outcome: "redacted",
    text: "Rekeningnummer BE68539007547034 doorgegeven",
    value: "BE68539007547034",
  },
  {
    id: "iban-no-short",
    entity: "iban",
    outcome: "redacted",
    text: "Konto NO9386011117947 registrert",
    value: "NO9386011117947",
  },
  {
    id: "iban-sentence-final",
    entity: "iban",
    outcome: "redacted",
    text: "Send it to DE89370400440532013000.",
    value: "DE89370400440532013000",
  },
  {
    id: "iban-lowercase",
    entity: "iban",
    outcome: "redacted",
    text: "iban as typed by the user: de89370400440532013000",
    value: "de89370400440532013000",
    note: "customers paste lowercase; the mod-97 checksum is what makes that affordable",
  },
  {
    id: "iban-dash-grouped",
    entity: "iban",
    outcome: "redacted",
    text: "Printed on the invoice as DE89-3704-0044-0532-0130-00",
    value: "DE89-3704-0044-0532-0130-00",
  },
]

const SSN_CASES: readonly PiiCase[] = [
  {
    id: "ssn-dashed",
    entity: "us_ssn",
    outcome: "redacted",
    text: "SSN on file 123-45-6789 for the applicant",
    value: "123-45-6789",
  },
  {
    id: "ssn-spaced",
    entity: "us_ssn",
    outcome: "redacted",
    text: "Social security 078 05 1120 confirmed by the agent",
    value: "078 05 1120",
  },
  {
    id: "ssn-sentence-final",
    entity: "us_ssn",
    outcome: "redacted",
    text: "His social is 123-45-6789.",
    value: "123-45-6789",
  },
  {
    id: "ssn-bare-nine",
    entity: "us_ssn",
    outcome: "missed",
    text: '{"ssn":"123456789","state":"CA"}',
    value: "123456789",
    note: "excluded on purpose: it would eat ids everywhere",
  },
  {
    id: "ssn-dotted",
    entity: "us_ssn",
    outcome: "redacted",
    text: "Typed as 123.45.6789 on the intake form",
    value: "123.45.6789",
  },
  {
    id: "ssn-itin",
    entity: "us_ssn",
    outcome: "redacted",
    text: "ITIN 900-70-1234 supplied instead of an SSN",
    value: "900-70-1234",
    note: "a 9xx area is never an SSN but is always an ITIN, checked against the assigned group ranges",
  },
]

const IP_CASES: readonly PiiCase[] = [
  {
    id: "ip-v4-private",
    entity: "ip_address",
    outcome: "redacted",
    text: "Client connected from 192.168.1.10 at 10:04",
    value: "192.168.1.10",
  },
  {
    id: "ip-v4-public",
    entity: "ip_address",
    outcome: "redacted",
    text: "Resolver 8.8.8.8 answered in 12ms",
    value: "8.8.8.8",
  },
  {
    id: "ip-v4-port",
    entity: "ip_address",
    outcome: "redacted",
    text: "Upstream 203.0.113.42:8080 returned 502",
    value: "203.0.113.42",
  },
  {
    id: "ip-v4-cidr",
    entity: "ip_address",
    outcome: "redacted",
    text: "Allowlist 10.0.0.1/24 for the ingest subnet",
    value: "10.0.0.1",
  },
  {
    id: "ip-v6-full",
    entity: "ip_address",
    outcome: "redacted",
    text: "Peer 2001:0db8:85a3:0000:0000:8a2e:0370:7334 handshake ok",
    value: "2001:0db8:85a3:0000:0000:8a2e:0370:7334",
  },
  {
    id: "ip-v6-compressed",
    entity: "ip_address",
    outcome: "redacted",
    text: "Route via 2001:db8::8a2e:370:7334 established",
    value: "2001:db8::8a2e:370:7334",
  },
  {
    id: "ip-v6-bracketed",
    entity: "ip_address",
    outcome: "redacted",
    text: "Connect to [2001:db8::1]:443 over TLS",
    value: "2001:db8::1",
  },
  {
    id: "ip-v4-sentence-final",
    entity: "ip_address",
    outcome: "redacted",
    text: "The request originated from 203.0.113.42.",
    value: "203.0.113.42",
    note: "a sentence period must not disable the detector",
  },
  {
    id: "ip-v6-loopback",
    entity: "ip_address",
    outcome: "redacted",
    text: "Listening on ::1 port 5432",
    value: "::1",
    note: "compresses from the left, so there is no group before the :: to anchor on",
  },
]

const SECRET_CASES: readonly PiiCase[] = [
  {
    id: "secret-openai",
    entity: "secret",
    outcome: "redacted",
    text: `export OPENAI_API_KEY="${OPENAI_KEY}"`,
    value: OPENAI_KEY,
  },
  {
    id: "secret-aws-access-key",
    entity: "secret",
    outcome: "redacted",
    text: `aws_access_key_id = ${AWS_ACCESS_KEY_ID}`,
    value: AWS_ACCESS_KEY_ID,
  },
  {
    id: "secret-slack-bot",
    entity: "secret",
    outcome: "redacted",
    text: `SLACK_BOT_TOKEN=${SLACK_BOT_TOKEN}`,
    value: SLACK_BOT_TOKEN,
  },
  {
    id: "secret-google-api-key",
    entity: "secret",
    outcome: "redacted",
    text: `maps key ${GOOGLE_API_KEY} in the bundle`,
    value: GOOGLE_API_KEY,
  },
  {
    id: "secret-stripe-live",
    entity: "secret",
    outcome: "redacted",
    text: `STRIPE_SECRET_KEY=${STRIPE_SECRET_KEY}`,
    value: STRIPE_SECRET_KEY,
  },
  {
    id: "secret-github-classic",
    entity: "secret",
    outcome: "redacted",
    text: `git remote set-url origin https://${GITHUB_TOKEN}@github.com/acme/app`,
    value: GITHUB_TOKEN,
    note: "also a valid email local part, so detector rank is what keeps the label right",
  },
  {
    id: "secret-postgres-dsn",
    entity: "secret",
    outcome: "redacted",
    text: "DATABASE_URL=postgres://app_user:Sup3rS3cretPass@db.internal:5432/prod",
    value: "Sup3rS3cretPass",
    note: "matched as the DSN credential, not as an email that happens to cover it",
  },
  {
    id: "secret-basic-auth",
    entity: "secret",
    outcome: "partial",
    text: "curl https://svc:P@ssw0rd123@internal.acme.com/health",
    value: "P@ssw0rd123",
    labelledAs: "email",
    note: "the email match starts after P@, so those two characters survive",
  },
  {
    id: "secret-aws-secret-key",
    entity: "secret",
    outcome: "redacted",
    text: "aws_secret_access_key = wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    value: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
    note: "no shape of its own, so only the assignment key identifies it",
  },
  {
    id: "secret-sendgrid",
    entity: "secret",
    outcome: "redacted",
    text: `SENDGRID_API_KEY=${SENDGRID_KEY}`,
    value: SENDGRID_KEY,
  },
  {
    id: "secret-huggingface",
    entity: "secret",
    outcome: "redacted",
    text: `HF_TOKEN=${HUGGINGFACE_TOKEN}`,
    value: HUGGINGFACE_TOKEN,
  },
  {
    id: "secret-gitlab-pat",
    entity: "secret",
    outcome: "redacted",
    text: `CI_TOKEN=${GITLAB_TOKEN}`,
    value: GITLAB_TOKEN,
  },
  {
    id: "secret-npm-token",
    entity: "secret",
    outcome: "redacted",
    text: `//registry.npmjs.org/:_authToken=${NPM_TOKEN}`,
    value: NPM_TOKEN,
  },
  {
    id: "secret-google-oauth",
    entity: "secret",
    outcome: "redacted",
    text: `refresh with ${GOOGLE_OAUTH_TOKEN}`,
    value: GOOGLE_OAUTH_TOKEN,
  },
  {
    id: "secret-slack-webhook",
    entity: "secret",
    outcome: "redacted",
    text: `posted to ${SLACK_WEBHOOK_URL}`,
    value: SLACK_WEBHOOK_URL,
  },
  {
    id: "secret-env-password",
    entity: "secret",
    outcome: "redacted",
    text: "POSTGRES_PASSWORD=hunter2Correct-Horse\nREDIS_PASSWORD=Tr0ub4dor&3",
    value: "hunter2Correct-Horse",
    note: "a plain password in a .env dump, identified by its key",
  },
  {
    id: "secret-env-password-second",
    entity: "secret",
    outcome: "redacted",
    text: "POSTGRES_PASSWORD=hunter2Correct-Horse\nREDIS_PASSWORD=Tr0ub4dor&3",
    value: "Tr0ub4dor&3",
  },
  {
    id: "secret-bearer-opaque",
    entity: "secret",
    outcome: "redacted",
    text: "curl -H 'Authorization: Bearer 9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0oKl' https://api.acme.com/v1/me",
    value: "9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0oKl",
    note: "opaque, so the Bearer scheme is the only signal",
  },
  {
    id: "secret-azure-hex",
    entity: "secret",
    outcome: "missed",
    text: "AZURE_OPENAI_KEY=9a3f7c2b1d4e6f8a0b2c4d6e8f0a2b4c",
    value: "9a3f7c2b1d4e6f8a0b2c4d6e8f0a2b4c",
  },
]

const CRYPTO_CASES: readonly PiiCase[] = [
  {
    id: "crypto-btc-bech32",
    entity: "crypto_wallet",
    outcome: "redacted",
    text: "Send to bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4 within an hour",
    value: "bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4",
  },
  {
    id: "crypto-btc-p2pkh",
    entity: "crypto_wallet",
    outcome: "redacted",
    text: "Legacy address 1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa received it",
    value: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  },
  {
    id: "crypto-eth",
    entity: "crypto_wallet",
    outcome: "redacted",
    text: "Wallet 0x742d35Cc6634C0532925a3b844Bc454e4438f44e signed the tx",
    value: "0x742d35Cc6634C0532925a3b844Bc454e4438f44e",
  },
  {
    id: "crypto-solana",
    entity: "crypto_wallet",
    outcome: "missed",
    text: "Solana wallet 7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV is funded",
    value: "7EcDhSYGxXyscszYEp35KHN8vvw3svAuLKTzXwCFLtV",
    note: "base58 with no 1/3 anchor and no checksum to validate against",
  },
]

const REALISTIC_CASES: readonly PiiCase[] = [
  { id: "chat-email", entity: "email", outcome: "redacted", text: CHAT, value: "maria.gonzalez@gmail.com" },
  { id: "chat-card", entity: "credit_card", outcome: "redacted", text: CHAT, value: "4111 1111 1111 1111" },
  { id: "chat-phone", entity: "phone", outcome: "redacted", text: CHAT, value: "+1-415-555-2671" },
  { id: "sql-email-first", entity: "email", outcome: "redacted", text: SQL_TABLE, value: "a.chen@corp.io" },
  { id: "sql-email-second", entity: "email", outcome: "redacted", text: SQL_TABLE, value: "b.patel@corp.io" },
  { id: "sql-phone-dashed", entity: "phone", outcome: "redacted", text: SQL_TABLE, value: "415-555-2671" },
  { id: "sql-phone-parens", entity: "phone", outcome: "redacted", text: SQL_TABLE, value: "(628) 555-0199" },
  { id: "sql-ip", entity: "ip_address", outcome: "redacted", text: SQL_TABLE, value: "203.0.113.42" },
  { id: "json-email", entity: "email", outcome: "redacted", text: TOOL_JSON, value: "erik.olsen@nordic.se" },
  { id: "json-iban", entity: "iban", outcome: "redacted", text: TOOL_JSON, value: "NL91ABNA0417164300" },
  { id: "json-ip", entity: "ip_address", outcome: "redacted", text: TOOL_JSON, value: "192.168.10.4" },
  {
    id: "json-jwt",
    entity: "secret",
    outcome: "redacted",
    text: TOOL_JSON,
    value: "eyJhbGciOiJIUzI1NiJ9.eyJhIjoxfQ.QWxhZGRpbjpvcGVuc2VzYW1l",
  },
  { id: "json-phone-intl", entity: "phone", outcome: "redacted", text: TOOL_JSON, value: "+46 70 123 45 67" },
  { id: "stack-ip", entity: "ip_address", outcome: "redacted", text: STACK_TRACE, value: "127.0.0.1" },
  {
    id: "stack-dsn-password",
    entity: "secret",
    outcome: "redacted",
    text: STACK_TRACE,
    value: "Sup3rS3cret",
    note: "an IP host gives the email detector nothing to match, so only the DSN pattern covers it",
  },
  {
    id: "k8s-password",
    entity: "secret",
    outcome: "redacted",
    text: K8S_SECRET,
    value: "aHVudGVyMkNvcnJlY3RIb3JzZQ==",
  },
  {
    id: "k8s-stripe-key",
    entity: "secret",
    outcome: "missed",
    text: K8S_SECRET,
    value: "c2tfbGl2ZV81MUg5YVpxMUxtVDR2Qm43WGtSMndFczhZdQ==",
  },
  { id: "vcard-email", entity: "email", outcome: "redacted", text: VCARD, value: "yuki.tanaka@example.jp" },
  { id: "vcard-phone", entity: "phone", outcome: "redacted", text: VCARD, value: "+81 90 1234 5678" },
]

const PII_CASES: readonly PiiCase[] = [
  ...EMAIL_CASES,
  ...PHONE_CASES,
  ...CARD_CASES,
  ...IBAN_CASES,
  ...SSN_CASES,
  ...IP_CASES,
  ...SECRET_CASES,
  ...CRYPTO_CASES,
  ...REALISTIC_CASES,
]

/**
 * Text that carries no PII. `matched` lists what the engine wrongly redacts today, so an entry with a
 * non-empty array is a false positive we have accepted for now and an empty array is a guard.
 */
interface CleanCase {
  readonly id: string
  readonly text: string
  readonly matched: readonly string[]
  readonly note?: string
}

const CLEAN_CASES: readonly CleanCase[] = [
  { id: "clean-npm-scope", text: "import type { Node } from '@scope/pkg'; npm i react@18.2.0", matched: [] },
  {
    id: "clean-docker-digest",
    text: "docker pull node@sha256:9f2b1c8e4a7d6f0b3c5e8a1d4f7b0c3e6a9d2f5b8c1e4a7d",
    matched: [],
  },
  { id: "clean-css-at-rule", text: "@media screen and (min-width: 600px) { .card { display: none } }", matched: [] },
  { id: "clean-social-handle", text: "See @johndoe on the platform, or ping @team-infra in chat.", matched: [] },
  { id: "clean-python-version", text: "brew install python@3.11 && pyenv local 3.11.9", matched: [] },
  { id: "clean-sql-like", text: "SELECT count(*) FROM users WHERE email LIKE '%@%.%' AND active", matched: [] },
  { id: "clean-git-reflog", text: "git reset --hard HEAD@{2} then rebase onto origin/main", matched: [] },
  {
    id: "clean-package-prerelease",
    text: "Installed package@1.2.beta and helper@0.9.rc1 in the sandbox.",
    matched: [],
  },
  { id: "clean-last-four", text: "Charged the Visa ending in 4242 for $18.00", matched: [] },
  { id: "clean-nanos-timestamp", text: "span start 1734567890123456789 end 1734567890987654321", matched: [] },
  { id: "clean-zero-run", text: "placeholder account 4000000000000000 in the fixture", matched: [] },
  { id: "clean-ssn-invalid-area", text: "Fixture values 000-12-3456 and 666-45-6789 are reserved", matched: [] },
  { id: "clean-ssn-invalid-group", text: "Part identifier 100-00-1234 and 200-45-0000 in the catalog", matched: [] },
  { id: "clean-iso-date", text: "Effective 2024-01-15 through 2025-12-31 inclusive", matched: [] },
  { id: "clean-uuid", text: "request_id 3f2a9c1e-7b4d-4e6f-8a0b-2c4d6e8f0a2b handled by worker 4", matched: [] },
  { id: "clean-base64-image", text: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJ", matched: [] },
  { id: "clean-css-class", text: '<div class="sk-spinner sk-child sk-bounce">loading</div>', matched: [] },
  {
    id: "clean-usage-counters",
    text: '{"usage":{"prompt_tokens":1523,"completion_tokens":88,"total_tokens":1611},"max_tokens":4096}',
    matched: [],
    note: "in nearly every LLM span, which is why plural `tokens` is not a credential key",
  },
  {
    id: "clean-opaque-key-ids",
    text: "idempotency_key=order-4471-retry partition_key=user_events_2024 cache_key=build-artifacts-v3",
    matched: [],
    note: "a bare `key` is not a credential key for exactly these",
  },
  {
    id: "clean-credential-references",
    text: "const apiKey = options.apiKey ?? process.env.OPENAI_API_KEY\nif (!apiKey) throw new Error('missing api key')",
    matched: [],
    note: "a reference to a credential is not a credential",
  },
  { id: "clean-credential-placeholders", text: "password: ****\ntoken: null\napi_key: <your key here>", matched: [] },
  { id: "clean-secret-prose", text: "Rotate the AKIA prefixed keys and the ghp tokens this quarter.", matched: [] },
  { id: "clean-invalid-octet", text: "Bad config value 192.168.1.256 rejected by the parser", matched: [] },
  { id: "clean-decimal-list", text: "Weights 0.25 0.5 0.75 applied per shard", matched: [] },
  { id: "clean-ports", text: "Bound ports 8000 9000 10000 on the ingest host", matched: [] },
  {
    id: "fp-retina-asset",
    text: "Use logo@2x.png for the header and icon@3x.svg for the tab.",
    matched: [],
    note: "rejected because a two-label domain whose TLD is a file extension is not a domain",
  },
  {
    id: "fp-build-tag",
    text: "Cache key resolved to v2@build.prod and artifact bundle@main.tar",
    matched: ["v2@build.prod"],
  },
  {
    id: "fp-metric-triplet",
    text: "p50 p95 p99 latencies: 250 300 1000 ms across the window",
    matched: ["250 300 1000"],
    note: "genuinely ambiguous without prose context",
  },
  { id: "fp-row-counts", text: "Rows scanned per shard: 100 200 3000 (total 3300)", matched: [] },
  {
    id: "fp-thousands-groups",
    text: "Revenue reached 1 234 567 8901 cents last quarter",
    matched: ["1 234 567 8901"],
    note: "the NANP trunk prefix absorbs the leading 1, so the same false positive is one digit wider",
  },
  { id: "fp-part-number", text: "Replace part 100-200-3000 with the revised assembly", matched: [] },
  { id: "fp-coordinates", text: "Grid offsets 123 456 7890 were emitted by the solver", matched: [] },
  {
    id: "fp-version-quad",
    text: "Upgraded the agent from version 1.2.3.4 to 1.2.10.0",
    matched: ["1.2.3.4", "1.2.10.0"],
    note: "the documented reason ip_address is off by default",
  },
  {
    id: "fp-notebook-slug",
    text: "notebook name sk-learn-tutorial-notebook-v2-final was archived",
    matched: [],
    note: "clears the length and digit gates; only the hyphenated-all-lowercase rule rejects it",
  },
]

describe("detector accuracy", () => {
  it.each(PII_CASES)("$id: $entity is $outcome", ({ text, value, entity, outcome, labelledAs }) => {
    const observation = observe(text, value)

    expect(observation.outcome).toBe(outcome)
    if (outcome !== "missed") expect(observation.labels).toContain(labelledAs ?? entity)
  })

  it.each(CLEAN_CASES)("$id redacts nothing it should not", ({ text, matched }) => {
    const accepted = resolveOverlaps(findRedactionMatches(text, ALL_ENTITIES))

    expect(accepted.map((match) => text.slice(match.start, match.end))).toEqual(matched)
  })
})

/**
 * Pinned so the corpus cannot drift silently in either direction. Closing a gap means editing the row
 * and then this number, which keeps the count honest and makes the improvement visible in the diff.
 */
describe("accuracy totals", () => {
  const counted = (outcome: Outcome): number => PII_CASES.filter((entry) => entry.outcome === outcome).length

  it("records every labelled occurrence exactly once", () => {
    expect(new Set(PII_CASES.map((entry) => entry.id)).size).toBe(PII_CASES.length)
    expect(PII_CASES).toHaveLength(118)
  })

  it("pins how much PII is stored verbatim", () => {
    expect(counted("missed")).toBe(9)
  })

  it("pins how much PII is only partially removed", () => {
    expect(counted("partial")).toBe(2)
  })

  it("pins how many matches land under the wrong entity", () => {
    expect(PII_CASES.filter((entry) => entry.labelledAs !== undefined)).toHaveLength(2)
  })

  it("pins the accepted false positives", () => {
    const falsePositives = CLEAN_CASES.flatMap((entry) => entry.matched)

    expect(falsePositives).toHaveLength(5)
  })

  it("covers every entity in the enum", () => {
    const covered = new Set(PII_CASES.map((entry) => entry.entity))

    expect([...REDACTION_ENTITIES].filter((entity) => !covered.has(entity))).toEqual([])
  })
})

/**
 * Ordinary punctuation around an identifier is not a special case, it is the common case, and a guard
 * written to exclude decimals excludes sentence-final periods with it. Sweeping every identifier shape
 * against every wrapper is what turns that from an anecdote into a list.
 */
describe("punctuation boundaries", () => {
  const SUBJECTS: readonly [label: string, entity: RedactionEntity, value: string][] = [
    ["email", "email", "a.b@corp.com"],
    ["phone NANP dashed", "phone", "415-555-2671"],
    ["phone NANP spaced", "phone", "415 555 2671"],
    ["phone E.164", "phone", "+14155552671"],
    ["card compact", "credit_card", "4111111111111111"],
    ["card grouped", "credit_card", "4111 1111 1111 1111"],
    ["card amex", "credit_card", "378282246310005"],
    ["iban compact", "iban", "DE89370400440532013000"],
    ["iban grouped", "iban", "DE89 3704 0044 0532 0130 00"],
    ["ssn", "us_ssn", "123-45-6789"],
    ["ipv4", "ip_address", "203.0.113.42"],
    ["secret sk-", "secret", vendorToken("sk-proj-", "9aZq1LmT4vBn7XkR2wEs8YuC3PdF6HgJ0oKl5MiQ")],
    ["eth address", "crypto_wallet", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e"],
  ]

  const WRAPPERS: readonly [label: string, wrap: (value: string) => string][] = [
    ["bare", (v) => `value is ${v} ok`],
    ["period", (v) => `value is ${v}.`],
    ["comma", (v) => `value is ${v}, next`],
    ["semicolon", (v) => `value is ${v}; next`],
    ["question", (v) => `is it ${v}?`],
    ["parens", (v) => `value (${v}) ok`],
    ["double quotes", (v) => `value "${v}" ok`],
    ["single quotes", (v) => `value '${v}' ok`],
    ["brackets", (v) => `value [${v}] ok`],
    ["json value", (v) => `{"k":"${v}"}`],
    ["newline", (v) => `value is\n${v}\nok`],
    ["ellipsis", (v) => `value is ${v}... ok`],
    ["leading dash", (v) => `value -${v} ok`],
    ["leading equals", (v) => `value=${v} ok`],
    ["markdown cell", (v) => `| id | ${v} | ok |`],
    ["trailing dash", (v) => `value ${v}-suffix ok`],
  ]

  const failures = (): string[] => {
    const out: string[] = []
    for (const [subject, entity, value] of SUBJECTS) {
      for (const [wrapper, wrap] of WRAPPERS) {
        const text = wrap(value)
        const start = text.indexOf(value)
        const hits = findRedactionMatches(text, new Set([entity])).filter(
          (match) => match.start <= start && match.end >= start + value.length,
        )
        if (hits.length === 0) out.push(`${subject} + ${wrapper}`)
      }
    }
    return out
  }

  // Every entry is a real leak: the identifier is present and stored verbatim because of the punctuation alone.
  it("records which identifier and punctuation combinations fail", () => {
    expect(failures()).toEqual(["phone NANP dashed + leading dash", "phone NANP spaced + leading dash"])
  })
})

/**
 * How often an innocuous identifier of the same shape gets redacted. Seeded, so the numbers are exact
 * rather than approximate, and bounded rather than pinned so a modest shift does not fail the suite.
 */
describe("collision rates on synthetic identifiers", () => {
  const mulberry32 = (seed: number) => () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = seed
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }

  const pick = (random: () => number, alphabet: string, length: number): string => {
    let out = ""
    for (let index = 0; index < length; index++) out += alphabet[Math.floor(random() * alphabet.length)]
    return out
  }

  const DIGITS = "0123456789"
  const BASE58 = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ123456789"

  const rate = (entity: RedactionEntity, seed: number, samples: number, generate: (random: () => number) => string) => {
    const random = mulberry32(seed)
    const entities = new Set([entity])
    let hits = 0
    for (let index = 0; index < samples; index++) {
      if (findRedactionMatches(generate(random), entities).length > 0) hits += 1
    }
    return hits / samples
  }

  it("collides with about one in ten Visa-shaped numeric ids", () => {
    expect(rate("credit_card", 2, 5_000, (random) => `4${pick(random, DIGITS, 15)}`)).toBeGreaterThan(0.05)
  })

  it("collides with about one in twenty Mastercard-shaped numeric ids", () => {
    expect(rate("credit_card", 3, 5_000, (random) => `5${pick(random, DIGITS, 15)}`)).toBeGreaterThan(0.02)
  })

  // The address checksum is what makes this zero rather than one: the shape alone matches every one of them.
  it("does not collide with base58-shaped opaque ids", () => {
    const observed = rate(
      "crypto_wallet",
      5,
      2_000,
      (random) => `${random() < 0.5 ? "1" : "3"}${pick(random, BASE58, 25 + Math.floor(random() * 10))}`,
    )

    expect(observed).toBe(0)
  })

  it("collides with every 40-character hex string", () => {
    expect(rate("crypto_wallet", 6, 2_000, (random) => `0x${pick(random, "0123456789abcdef", 40)}`)).toBe(1)
  })
})

/**
 * A canary for catastrophic backtracking, not a benchmark. Span content is attacker controlled, so a
 * pattern that goes superlinear is a denial-of-service vector on the ingest hot path. The bound is
 * deliberately far above the measured cost (sub-millisecond for this input) so ordinary CI noise cannot
 * fail it and only a pathological pattern can.
 */
describe("scan cost", () => {
  const CHUNK = [
    "assistant: I updated the handler at packages/domain/spans/src/otlp/transform.ts:181.",
    'tool_output: {"passed":142,"failed":0,"duration_ms":18432,"commit":"1f4e2a9b7c5d3e8f0a2b4c6d8e0f2a4b6c8d0e2f"}',
    "user: check the ingest latency p50 250 p95 300 p99 1000 and the version 1.2.3.4 rollout",
    "+  const client = new Client({ url: process.env.LAT_CLICKHOUSE_URL })",
  ].join("\n")

  it("scans a 32 KB leaf well inside the per-span budget", () => {
    let text = ""
    while (text.length < 32_768) text += CHUNK
    text = text.slice(0, 32_768)

    const started = performance.now()
    findRedactionMatches(text, ALL_ENTITIES)
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(250)
  })

  it("does not blow up on a long run of separator-shaped characters", () => {
    const adversarial = `${"9 ".repeat(4_000)}${"-".repeat(4_000)}${"4111 ".repeat(1_000)}`

    const started = performance.now()
    findRedactionMatches(adversarial, ALL_ENTITIES)
    const elapsed = performance.now() - started

    expect(elapsed).toBeLessThan(250)
  })
})
