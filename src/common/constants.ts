/**
 * How long after posting a chat message its author may still edit it.
 * Applies to trip, DM and group messages. Keep this the single source of
 * truth — the mobile/web clients mirror the same value client-side to show or
 * hide the Edit action, but the server is the authority.
 */
export const EDIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours
