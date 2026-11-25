/**
 * Keep in sync with backend/src/privacy/policy.ts (CI checks this with scripts/check-policy-version.sh).
 * Bump when the privacy notice text changes materially.
 */
export const PRIVACY_NOTICE_VERSION = '2026-11-draft-1';

/**
 * Who is responsible for the data. Set these at build time (VITE_*); until then the notice shows
 * clearly marked placeholders so it can never silently go live without an owner.
 */
export const OPERATOR = {
  name: import.meta.env.VITE_OPERATOR_NAME || '[Operator legal name]',
  address: import.meta.env.VITE_OPERATOR_ADDRESS || '[Postal address]',
  privacyEmail: import.meta.env.VITE_PRIVACY_EMAIL || '[privacy contact email]',
};
