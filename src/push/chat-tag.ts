/**
 * Android notification `tag` of a chat, from the RECIPIENT's point of view
 * (a DM is tagged with the other person's id). A new push with the same tag
 * replaces the one already in the tray — one entry per chat instead of a
 * pile — and the apps clear a chat's entry by it once it's read anywhere.
 * The mobile apps build the same strings (lib/chat-ref.ts `chatTag`).
 */
export const chatTag = {
  dm: (peerId: string) => `dm:${peerId}`,
  group: (groupId: string) => `group:${groupId}`,
  trip: (tripId: string) => `trip:${tripId}`,
};
