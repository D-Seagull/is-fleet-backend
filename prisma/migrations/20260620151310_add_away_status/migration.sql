-- AWAY ("не на місці") — a softer alternative to BUSY for managers who
-- stepped away briefly. Push gate treats it the same as BUSY/SLEEP/
-- VACATION (any non-ONLINE silences banners), so all this migration
-- needs is the new enum value.
ALTER TYPE "UserStatus" ADD VALUE 'AWAY';
