/**
 * Best-effort display name from an email address, for accounts created without
 * anyone to ask — partner provisioning, where the partner may know only the
 * address.
 *
 * `ada.lovelace@example.com` becomes `Ada Lovelace`. Plus-addressing is dropped,
 * separators become spaces, and each word is capitalized. Returns `""` when the
 * local part carries no letters or digits at all (`"..."@x.com`), which the app
 * already treats as "no name" and prompts for later.
 */
export const deriveDisplayNameFromEmail = (email: string): string => {
  const localPart = email.trim().toLowerCase().split("@")[0] ?? ""
  // Plus-addressing is a routing tag, not part of the person's name.
  const withoutTag = localPart.split("+")[0] ?? ""

  return withoutTag
    .split(/[._\-\s]+/)
    .map((word) => word.replace(/[^a-z0-9]/g, ""))
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
}

/**
 * Default organization name for an account created without one being supplied.
 * Falls back to a generic label when the display name is empty, so the org
 * never ends up named after nothing.
 */
export const deriveOrganizationNameFromDisplayName = (displayName: string): string =>
  displayName.trim().length > 0 ? `${displayName.trim()}'s Organization` : "My Organization"
