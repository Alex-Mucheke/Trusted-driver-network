/**
 * Privacy policy constants shared by the API and the tests.
 *
 * DRAFT: the notice text (frontend/src/pages/Privacy.tsx) and the retention defaults below are
 * working drafts that must be confirmed by a Kenyan data-protection lawyer before the pilot.
 */

/** Bump when the privacy notice text changes materially; users are asked to re-acknowledge. */
export const PRIVACY_NOTICE_VERSION = '2026-11-draft-1';

/**
 * Internal target for answering a data-subject request. The Data Protection Act fixes 30 days for
 * portability (s.38) and says "without undue delay" for erasure/correction (s.40); we use one
 * clock for everything so nothing is missed.
 */
export const DSR_RESPONSE_DAYS = 30;

/** Stops one user flooding the admin queue. */
export const MAX_OPEN_DATA_REQUESTS = 5;

export const OPEN_BOOKING_STATES = [
  'REQUESTED',
  'ACCEPTED',
  'EN_ROUTE',
  'ARRIVED',
  'IN_PROGRESS',
] as const;

export const TERMINAL_BOOKING_STATES = ['COMPLETED', 'CANCELLED', 'DECLINED', 'EXPIRED'] as const;

export const REDACTED_TEXT = '[removed]';
export const REDACTED_MESSAGE = '[message deleted]';

/** What ride addresses become once they are past retention or their owner is erased. */
export const SCRUBBED_RIDE = {
  pickupAddress: REDACTED_TEXT,
  dropoffAddress: REDACTED_TEXT,
  pickupLat: 0,
  pickupLng: 0,
  dropoffLat: 0,
  dropoffLng: 0,
} as const;

/** Default retention periods in days. Each can be overridden by the env var of the same key. */
export const RETENTION_DEFAULTS = {
  NOTIFICATION_RETENTION_DAYS: 90,
  MESSAGE_RETENTION_DAYS: 180,
  RIDE_DETAILS_RETENTION_DAYS: 365,
  PAYMENT_CALLBACK_RETENTION_DAYS: 90,
} as const;

export function retentionDays(key: keyof typeof RETENTION_DEFAULTS): number {
  const raw = process.env[key];
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : RETENTION_DEFAULTS[key];
}

export const DAY_MS = 24 * 60 * 60 * 1000;
