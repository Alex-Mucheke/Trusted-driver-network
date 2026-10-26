export type Role = 'CUSTOMER' | 'DRIVER' | 'ADMIN';

export interface User {
  id: string;
  name: string;
  email: string;
  phone: string;
  roles: Role[];
}

export interface Vehicle {
  id?: string;
  plate: string;
  type: string;
  make: string;
  model: string;
  color: string;
  capacity?: number;
  active?: boolean;
}

export interface DriverBrief {
  id: string;
  name: string;
  driverProfile?: {
    photoUrl?: string | null;
    serviceArea?: string | null;
    availability?: 'ONLINE' | 'OFFLINE';
    verificationStatus?: string;
    shareCode?: string;
    vehicles: Vehicle[];
  } | null;
}

export type BookingState =
  | 'DRAFT' | 'REQUESTED' | 'ACCEPTED' | 'EN_ROUTE' | 'ARRIVED' | 'IN_PROGRESS'
  | 'COMPLETED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';

export type ReferralState =
  | 'PROPOSED' | 'CANDIDATE_ACCEPTED' | 'CUSTOMER_APPROVED' | 'CANDIDATE_DECLINED'
  | 'CUSTOMER_REJECTED' | 'EXPIRED' | 'CANCELLED';

export interface Referral {
  id: string;
  bookingId: string;
  proposerId: string;
  candidateId: string;
  state: ReferralState;
  revisedQuote: number | null;
  etaMinutes: number | null;
  expiresAt: string;
  candidate?: DriverBrief;
}

export interface RideDetails {
  pickupAddress: string; pickupLat: number; pickupLng: number;
  dropoffAddress: string; dropoffLat: number; dropoffLng: number;
  distanceKm: number;
}

export interface Payment {
  id: string; method: 'CASH' | 'MPESA'; state: string;
  serviceCharge: number; itemCost: number; platformFee: number; tip: number; total: number;
  receiptNumber: string | null; paidAt: string | null;
}

export interface BookingEvent { id: string; type: string; actorId: string | null; createdAt: string; metadata?: unknown }

export interface Booking {
  id: string;
  customerId: string;
  requestedDriverId: string;
  assignedDriverId: string | null;
  type: string;
  state: BookingState;
  quote: number;
  currency: string;
  scheduledAt: string | null;
  passengerCount: number;
  notes: string | null;
  expiresAt: string;
  createdAt: string;
  rideDetails?: RideDetails | null;
  customer: { id: string; name: string; phone?: string };
  requestedDriver: DriverBrief;
  assignedDriver: DriverBrief | null;
  referrals?: Referral[];
  events?: BookingEvent[];
  payment?: Payment | null;
  review?: { rating: number; comment?: string | null } | null;
}

export interface NotificationItem {
  id: string; type: string; title: string; body: string; readAt: string | null; createdAt: string;
  data?: { bookingId?: string } | null;
}
