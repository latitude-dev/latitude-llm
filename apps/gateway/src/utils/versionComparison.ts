interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease?: {
    identifier: string
    version?: number
  }
}

/**
 * Compares two semantic version strings to determine if the current version
 * is greater than or equal to the target version.
 *
 * @param version - The current version string to compare (e.g., "1.2.3" or "1.2.3-beta.1").
 *                  If undefined, defaults to true (assumes latest version).
 * @param targetVersion - The target version string to compare against (e.g., "1.0.0" or "1.0.0-alpha.1").
 *                        Must be a valid semantic version string.
 * @returns True if the current version is greater than or equal to the target version,
 *          false otherwise. Returns true if version is undefined.
 *
 * @example
 * ```typescript
 * compareVersion("1.2.3", "1.0.0") // returns true
 * compareVersion("1.0.0", "1.2.3") // returns false
 * compareVersion("1.2.3", "1.2.3") // returns true
 * compareVersion("1.0.0-beta.1", "1.0.0-alpha.1") // returns true
 * compareVersion("1.0.0-beta.1", "1.0.0") // returns true
 * compareVersion("1.0.0", "1.0.0-beta.1") // returns true
 * compareVersion(undefined, "1.0.0") // returns true
 * ```
 *
 * @remarks
 * - Version strings should follow semantic versioning format (major.minor.patch[-prerelease])
 * - Missing version parts default to 0 (e.g., "1.2" becomes "1.2.0")
 * - Prerelease versions have lower precedence than normal versions
 * - Prerelease identifiers are compared lexically (alpha < beta < rc)
 * - If no version header is present (undefined), defaults to using the latest methods
 * - Comparison follows semantic versioning rules: major > minor > patch > prerelease
 */
export function compareVersion(version: string | undefined, targetVersion: string): boolean {
  if (!version) return false

  const parseVersion = (v: string): ParsedVersion => {
    const [versionPart] = v.split('-')
    if (!versionPart) {
      throw new Error(`Invalid version format: ${v}`)
    }

    const parts = versionPart.split('.').map(Number)
    const parsed: ParsedVersion = {
      major: parts[0] || 0,
      minor: parts[1] || 0,
      patch: parts[2] || 0,
    }

    return parsed
  }

  const current = parseVersion(version)
  const target = parseVersion(targetVersion)

  // Compare major.minor.patch first
  if (current.major !== target.major) {
    return current.major > target.major
  }
  if (current.minor !== target.minor) {
    return current.minor > target.minor
  }
  if (current.patch !== target.patch) {
    return current.patch > target.patch
  }

  // If base versions are equal, compare prerelease
  return comparePrereleaseVersions(current.prerelease, target.prerelease)
}

/**
 * Compares prerelease versions according to semantic versioning rules.
 * Normal version > prerelease version.
 * When both are prerelease: compare identifier lexically, then version numerically.
 */
function comparePrereleaseVersions(
  current?: ParsedVersion['prerelease'],
  target?: ParsedVersion['prerelease'],
): boolean {
  // If neither has prerelease, they are equal
  if (!current && !target) return true

  // Normal version > prerelease version
  if (!current && target) return true // current is normal, target is prerelease
  if (current && !target) return true // current is prerelease, target is normal (prerelease satisfies normal requirement)

  // Both are prerelease - compare identifiers
  if (current && target) {
    // Define prerelease precedence order
    const prereleaseOrder = ['alpha', 'beta', 'rc']
    const currentIndex = prereleaseOrder.indexOf(current.identifier)
    const targetIndex = prereleaseOrder.indexOf(target.identifier)

    // If identifiers are different, compare by precedence
    if (currentIndex !== targetIndex) {
      // Handle unknown identifiers by lexical comparison
      if (currentIndex === -1 || targetIndex === -1) {
        return current.identifier >= target.identifier
      }
      return currentIndex > targetIndex
    }

    // Same identifier, compare version numbers
    const currentVersion = current.version || 0
    const targetVersion = target.version || 0
    return currentVersion >= targetVersion
  }

  return true
}
