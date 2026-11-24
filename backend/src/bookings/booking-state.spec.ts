import {
  ACTIVE_JOB_STATES,
  BOOKING_TRANSITIONS,
  BookingStateName,
  canTransition,
  isTerminal,
} from './booking-state';

describe('booking state machine', () => {
  it('allows the happy path in order', () => {
    const path: BookingStateName[] = [
      'DRAFT',
      'REQUESTED',
      'ACCEPTED',
      'EN_ROUTE',
      'ARRIVED',
      'IN_PROGRESS',
      'COMPLETED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canTransition(path[i], path[i + 1])).toBe(true);
    }
  });

  it('does not allow skipping states', () => {
    expect(canTransition('REQUESTED', 'IN_PROGRESS')).toBe(false);
    expect(canTransition('ACCEPTED', 'COMPLETED')).toBe(false);
    expect(canTransition('ARRIVED', 'COMPLETED')).toBe(false);
  });

  it('does not allow leaving terminal states', () => {
    for (const s of ['COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED'] as BookingStateName[]) {
      expect(isTerminal(s)).toBe(true);
      expect(BOOKING_TRANSITIONS[s]).toHaveLength(0);
    }
  });

  it('cannot cancel a ride that is already in progress', () => {
    expect(canTransition('IN_PROGRESS', 'CANCELLED')).toBe(false);
  });

  it('only declines/expires before a driver is assigned', () => {
    expect(canTransition('REQUESTED', 'DECLINED')).toBe(true);
    expect(canTransition('ACCEPTED', 'DECLINED')).toBe(false);
    expect(canTransition('REQUESTED', 'EXPIRED')).toBe(true);
    expect(canTransition('ACCEPTED', 'EXPIRED')).toBe(false);
  });

  it('treats ACCEPTED..IN_PROGRESS as active job states', () => {
    expect(ACTIVE_JOB_STATES).toEqual(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']);
  });
});
