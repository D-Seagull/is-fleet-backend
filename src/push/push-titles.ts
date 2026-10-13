/**
 * Titles of chat-message pushes. They used to be just the sender's name —
 * the same for a trip chat and a direct message, so a driver couldn't tell
 * where a message had landed until opening the app. Each kind now says it:
 *
 *   trip chat   🚚 DX90237 · Dmytro Chaika
 *   direct      💬 Dmytro Chaika
 *   group       👥 Night shift · Dmytro Chaika
 *
 * `fallback` (localised "New message") stands in for a missing name.
 */
const join = (...parts: (string | null | undefined)[]) =>
  parts.filter((p) => p && p.trim()).join(' · ');

export const pushTitle = {
  trip: (plate: string | null | undefined, sender: string, fallback: string) =>
    `🚚 ${join(plate, sender) || fallback}`,
  direct: (sender: string, fallback: string) => `💬 ${sender || fallback}`,
  group: (group: string | null | undefined, sender: string, fallback: string) =>
    `👥 ${join(group, sender) || fallback}`,
};
