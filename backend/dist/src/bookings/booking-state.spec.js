"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const booking_state_1 = require("./booking-state");
describe('booking state machine', () => {
    it('allows the happy path in order', () => {
        const path = [
            'DRAFT', 'REQUESTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED',
        ];
        for (let i = 0; i < path.length - 1; i++) {
            expect((0, booking_state_1.canTransition)(path[i], path[i + 1])).toBe(true);
        }
    });
    it('does not allow skipping states', () => {
        expect((0, booking_state_1.canTransition)('REQUESTED', 'IN_PROGRESS')).toBe(false);
        expect((0, booking_state_1.canTransition)('ACCEPTED', 'COMPLETED')).toBe(false);
        expect((0, booking_state_1.canTransition)('ARRIVED', 'COMPLETED')).toBe(false);
    });
    it('does not allow leaving terminal states', () => {
        for (const s of ['COMPLETED', 'DECLINED', 'CANCELLED', 'EXPIRED']) {
            expect((0, booking_state_1.isTerminal)(s)).toBe(true);
            expect(booking_state_1.BOOKING_TRANSITIONS[s]).toHaveLength(0);
        }
    });
    it('cannot cancel a ride that is already in progress', () => {
        expect((0, booking_state_1.canTransition)('IN_PROGRESS', 'CANCELLED')).toBe(false);
    });
    it('only declines/expires before a driver is assigned', () => {
        expect((0, booking_state_1.canTransition)('REQUESTED', 'DECLINED')).toBe(true);
        expect((0, booking_state_1.canTransition)('ACCEPTED', 'DECLINED')).toBe(false);
        expect((0, booking_state_1.canTransition)('REQUESTED', 'EXPIRED')).toBe(true);
        expect((0, booking_state_1.canTransition)('ACCEPTED', 'EXPIRED')).toBe(false);
    });
    it('treats ACCEPTED..IN_PROGRESS as active job states', () => {
        expect(booking_state_1.ACTIVE_JOB_STATES).toEqual(['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS']);
    });
});
//# sourceMappingURL=booking-state.spec.js.map