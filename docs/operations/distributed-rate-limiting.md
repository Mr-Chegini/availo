# Distributed Public Booking Rate Limiting

The current public booking rate limiter is intentionally in-memory. It is
acceptable for local development and single-instance MVP deployments, but it is
not sufficient when the Call Requests Service runs more than one instance.

Current implementation:

- Guard: `call-requests-service/src/app/rate-limit/public-booking-rate-limit.guard.ts`
- Groups: `lookup`, `availability`, `create`, `manage`
- Key shape: `{group}:{clientIp}`
- Default window: `60` seconds
- Defaults:
  - lookup: `120`
  - availability: `120`
  - create: `10`
  - manage: `30`

## Production Target

Use Redis as the shared rate-limit store before horizontally scaling the Call
Requests Service.

Recommended configuration:

```env
PUBLIC_BOOKING_RATE_LIMIT_STORE=redis
REDIS_URL=redis://redis:6379
PUBLIC_BOOKING_RATE_LIMIT_WINDOW_SECONDS=60
PUBLIC_BOOKING_RATE_LIMIT_LOOKUP_MAX=120
PUBLIC_BOOKING_RATE_LIMIT_AVAILABILITY_MAX=120
PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX=10
PUBLIC_BOOKING_RATE_LIMIT_MANAGE_MAX=30
```

Keep `PUBLIC_BOOKING_RATE_LIMIT_STORE=memory` or unset for local development.

## Redis Key Design

Use namespaced keys:

```text
availo:rate-limit:public-booking:{group}:{clientIp}
```

Examples:

```text
availo:rate-limit:public-booking:lookup:203.0.113.10
availo:rate-limit:public-booking:create:203.0.113.10
```

The value should be the request count for the current window. The key TTL should
match the configured window.

## Atomic Increment

The Redis implementation must update count and TTL atomically. Use either a Lua
script or a Redis transaction that guarantees the first increment sets the
expiry.

Lua script shape:

```lua
local current = redis.call("INCR", KEYS[1])
if current == 1 then
  redis.call("PEXPIRE", KEYS[1], ARGV[1])
end
return current
```

Inputs:

- `KEYS[1]`: rate-limit key
- `ARGV[1]`: window duration in milliseconds

The guard should reject when the returned count is greater than the configured
limit.

## Failure Mode

For public booking endpoints, Redis failures should fail closed in staging and
production. Returning `429` is preferable to silently disabling rate limits when
the app is horizontally scaled.

Local development can keep using the in-memory limiter.

## Rollout Plan

1. Add a Redis service to local Docker Compose for development testing.
2. Add `REDIS_URL` and `PUBLIC_BOOKING_RATE_LIMIT_STORE` validation to the Call
   Requests Service.
3. Introduce a small rate-limit store abstraction:
   - `MemoryRateLimitStore`
   - `RedisRateLimitStore`
4. Keep the existing guard API and decorators unchanged.
5. Add focused tests for:
   - memory store behavior
   - Redis store command/script behavior with a mocked Redis client
   - guard rejection when the store count exceeds the limit
   - Redis failure behavior
6. Deploy to staging with `PUBLIC_BOOKING_RATE_LIMIT_STORE=redis`.
7. Load-test public booking endpoints from multiple app instances.
8. Enable the same config in production before horizontal scaling.

## Open Decision

Choose the Redis client before implementation. Options:

- `ioredis`
- `redis`

Prefer the client already used by the hosting platform or the one that best fits
the deployment target.

Do not add Redis-backed rate limiting without also updating the secret/config
docs for `REDIS_URL`.
