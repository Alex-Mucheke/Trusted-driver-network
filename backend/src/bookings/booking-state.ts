// Pure state-machine definitions (no Prisma import) so they can be unit-tested in isolation.

export type BookingStateName =
  | 'DRAFT'
  | 'REQUESTED'
  | 'ACCEPTED'
  | 'EN_ROUTE'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'EXPIRED';

/** DRAFT -> REQUESTED -> ACCEPTED -> EN_ROUTE -> ARRIVED -> IN_PROGRESS -> COMPLETED (+ terminal alternatives). */
export const BOOKING_TRANSITIONS: Record<BookingStateName, BookingStateName[]> = {
  DRAFT: ['REQUESTED', 'CANCELLED'],
  REQUESTED: ['ACCEPTED', 'DECLINED', 'CANCELLED', 'EXPIRED'],
  ACCEPTED: ['EN_ROUTE', 'CANCELLED'],
  EN_ROUTE: ['ARRIVED', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED'],
  COMPLETED: [],
  DECLINED: [],
  CANCELLED: [],
  EXPIRED: [],
};

export function canTransition(from: BookingStateName, to: BookingStateName): boolean {
  return BOOKING_TRANSITIONS[from].includes(to);
}

export function isTerminal(state: BookingStateName): boolean {
  return BOOKING_TRANSITIONS[state].length === 0;
}

/** States in which a driver is committed to a job (used for busy checks and precise-GPS authorization). */
export const ACTIVE_JOB_STATES: BookingStateName[] = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];

/** States a driver may push a booking into via the status endpoint. */
export const DRIVER_PROGRESS_STATES: BookingStateName[] = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];

/** States from which the customer may still cancel (not once the ride is underway). */
export const CUSTOMER_CANCELLABLE: BookingStateName[] = ['REQUESTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];

/** States from which the assigned driver may cancel. */
export const DRIVER_CANCELLABLE: BookingStateName[] = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
