export const FEATURE_FLAG_IDENTIFIER_MAX_LENGTH = 128
export const FEATURE_FLAG_NAME_MAX_LENGTH = 256

/**
 * Known feature-flag identifiers used from code. Flags are otherwise dynamic
 * (created/toggled through the backoffice), but any flag the app reads needs a
 * typed constant here so a typo can't silently disable the gate.
 */
export const CLAUDE_CODE_WRAPPED_FLAG = "claude-code-wrapped" as const

/**
 * Gates the notification-email channel end-to-end. When off:
 *   - the creator step in the notifications worker skips publishing
 *     `notification-email:send` tasks for the org;
 *   - the user-prefs settings UI hides the "Email notifications" section.
 *
 * In-app notifications (bell + feed) are gated separately by the
 * `"notifications"` flag and are unaffected by this one.
 */
export const EMAIL_NOTIFICATIONS_FLAG = "email-notifications" as const

/**
 * Gates the Slack integration end-to-end. When off:
 *   - the "Connect Slack" surface in settings is hidden;
 *   - OAuth install + callback routes refuse new installs;
 *   - the notifications producer skips fanning out
 *     `notification-slack:send` tasks for the org (Phase 3);
 *   - the inbound `app_mention` webhook ignores events for the org
 *     (Phase 4).
 *
 * Connection rows already in `slack_integrations` are unaffected by
 * flipping the flag — turning the flag back on resumes delivery
 * without forcing a re-install.
 */
export const SLACK_FLAG = "slack" as const
