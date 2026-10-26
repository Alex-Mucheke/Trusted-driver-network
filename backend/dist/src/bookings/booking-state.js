"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DRIVER_CANCELLABLE = exports.CUSTOMER_CANCELLABLE = exports.DRIVER_PROGRESS_STATES = exports.ACTIVE_JOB_STATES = exports.BOOKING_TRANSITIONS = void 0;
exports.canTransition = canTransition;
exports.isTerminal = isTerminal;
exports.BOOKING_TRANSITIONS = {
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
function canTransition(from, to) {
    return exports.BOOKING_TRANSITIONS[from].includes(to);
}
function isTerminal(state) {
    return exports.BOOKING_TRANSITIONS[state].length === 0;
}
exports.ACTIVE_JOB_STATES = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED', 'IN_PROGRESS'];
exports.DRIVER_PROGRESS_STATES = ['EN_ROUTE', 'ARRIVED', 'IN_PROGRESS', 'COMPLETED'];
exports.CUSTOMER_CANCELLABLE = ['REQUESTED', 'ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
exports.DRIVER_CANCELLABLE = ['ACCEPTED', 'EN_ROUTE', 'ARRIVED'];
//# sourceMappingURL=booking-state.js.map