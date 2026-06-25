export const PUBLIC_BOOKING_RATE_LIMIT_STORE = Symbol(
  'PUBLIC_BOOKING_RATE_LIMIT_STORE',
);

export interface ConsumeRateLimitInput {
  key: string;
  windowMs: number;
}

export interface PublicBookingRateLimitStore {
  consume(input: ConsumeRateLimitInput): Promise<number>;
}
