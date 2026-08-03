# Users

User identity in web auth flows comes from Better Auth `users` and is surfaced to boundaries through `getSession().user`.

User-level reliability settings are intentionally small.

Reliability execution credentials and shared monitoring behavior belong to organizations and projects, not to individual users.

## Reliability additions

For API-key-based calls, `apps/api` and `apps/ingest` derive user context as `api-key:{keyId}`, with organization authorization handled separately from session state.

Users gain a `settings` JSONB payload for personal workflow preferences only.

The exact fields are still pending definition in the proposal.

## Why User Scope Stays Small

Keeping reliability user settings small avoids:

1. credential fragmentation
2. shared operational behavior depending on who is signed in

User scope should shape personal UX, not shared operational policy.

## Language

**Calling code**:
The E.164 dial prefix a user selects during onboarding, stored as bare digits (`34`, `1`).
_Avoid_: country code, dial code, area code, IDD prefix

**National number**:
The subscriber portion typed after the calling code. E.164 excludes the trunk digit, which the field flags rather than enforces.
_Avoid_: local number, subscriber number

**Phone number**:
The composed value persisted on the user: a calling code and national number as one `+`-prefixed string.
_Avoid_: telephone, contact number, mobile

**Trunk digit**:
The leading digit (usually `0`, `8` on `+7`) written domestically and omitted in E.164.
_Avoid_: trunk code, national prefix, leading zero

## Phone number

`users.phone_number` is a nullable free-text column holding a single composed value. Onboarding is the only write path; the value feeds the backoffice user detail view and the Loops marketing contact, whose purpose is a human sales or support dial.

Onboarding collects the calling code and the national number as two inputs and composes them on submit. **The country is deliberately not part of the model**: not a column, not a form value, not derived at read time. Users pick from a country-labelled list purely as a finding affordance; the selection collapses to a calling code the moment it is made.

That choice is irreversible for stored data and should not be "fixed" by adding a country column later. Roughly fifty countries share `+1` and four share `+44`, so no column added after the fact can recover which country a past user chose. Adding one would only describe users onboarded after the change, leaving a permanently mixed dataset.

Two consequences follow and are intentional:

- The picker's trigger shows a bare `+44`, never a flag. After the collapse, no single country is determinable, so any flag would be a guess. Flags appear only on list rows, where each row genuinely is one country.
- Per-country validation is impossible, which is why no phone-parsing library is a dependency. There is nothing for one to validate against.

### Default calling code

The default comes from the browser's IANA timezone, resolved by scanning ICU's per-region zone lists for the current zone. Timezone is used rather than the browser locale because locale carries *language*, not location: every English-language browser maximizes to region `US`, so a Spanish developer running an English OS would silently default to `+1`. Renamed IANA zones are handled by canonicalising the input through `Intl.DateTimeFormat`, so both sides of the comparison come from the same engine's ICU and agree. Detection is feature-detected and falls back to no default.

### What the server guarantees

The write path enforces that a stored number starts with a calling code that exists in the country table and is digits-only within E.164 length (`+`, then 5 to 15 digits). It does **not** claim the number is dialable, since `+12345` passes. Checking the prefix against the table rather than a bare `\d` pattern means an unassigned prefix such as `+99999999` is rejected.

The two checks are split deliberately. The Zod validator checks only the shape, so obvious junk is rejected at the boundary; the handler does the table lookup, because that path reports to Datadog and server-only imports belong in the handler rather than the validator.

Since the table can go stale, every rejection emits a Datadog Error Tracking issue (`UnknownCallingCodeError`) on its own `phone.unknown_calling_code` span, following the same shape as the unpriced-spans reporter: a constant message so all occurrences group into one issue, and the varying data on span attributes. A country code assigned after the table was last updated therefore shows up as a repeating `phone.candidate_prefix` at a plausible `phone.digit_count`, rather than failing silently.

**Only the leading three digits and the total digit count are reported.** The rejected value is a personal phone number and must never reach Datadog. Reports are throttled to one per prefix per hour, over an LRU-bounded map, because submissions are driven by whatever users and bots send.

This is deliberately looser than the `phone` PII detector's 8-digit floor ([`../specs/pii-redaction.md`](../specs/pii-redaction.md)). The two have opposite risk profiles: a detector scanning free trace text must not fire on incidental digit runs, whereas a signup validator must not reject a real number. An 8-digit floor would reject genuine 7-digit numbers from `+290`, `+683` and `+690`.

### Trunk digits are flagged, never stripped

A national number still carrying its trunk digit is surfaced as a non-blocking hint showing what would be stored; the user decides. Auto-stripping is wrong because the leading `0` is significant on Italian landlines (`+39 06 …` is Rome), and a zero-only rule would miss `+7`, where the trunk digit is `8`.

### Known gaps

- The value is write-once. Account settings expose name only, so a user cannot correct a mistyped number, and the backoffice has no edit affordance. Making it editable additionally requires a marketing re-sync, since the Loops contact updates only on `UserOnboardingCompleted`.
- Rows written before calling codes were collected hold bare national digits. They cannot be backfilled, because a calling code is not inferable from `612345678` without the country, which was never recorded. The leading `+` is the marker distinguishing a dialable value.
