// Shortest password accepted when one is set (registration by invite,
// password reset). Sign-in is not checked against it, so accounts created
// under the old 6-character rule keep working. The web forms mirror this
// number (is-fleet-frontend/src/lib/password-policy.ts).
export const PASSWORD_MIN_LENGTH = 10;
