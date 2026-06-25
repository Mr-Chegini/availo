# Deployment Environments

Availo currently supports three intended deployment environments:

- `development`: local development and local Docker Compose.
- `staging`: production-like validation before customer traffic.
- `production`: customer-facing runtime.

The backend services load `.env.local` first and then `.env`. Real environment
files are ignored by git. Keep secrets out of committed files.

## Local Development

Use `.env.example` as the starting point:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Local values:

- `NODE_ENV=development`
- `MONGODB_URI=mongodb://localhost:27017/call-reservation`
- `RABBITMQ_URL=amqp://guest:guest@localhost:5672`
- `ADMIN_API_KEY=dev-admin-key`
- `PUBLIC_BOOKING_BASE_URL=http://localhost:3000/api`
- `VITE_API_BASE_URL=http://localhost:3000/api`
- `PUBLIC_BOOKING_RATE_LIMIT_STORE=memory`

Run Docker Compose from the repository root:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml up --build
```

The Compose file uses internal service hostnames for backend containers:

- `mongodb://mongodb:27017/call-reservation`
- `amqp://guest:guest@rabbitmq:5672`
- `redis://redis:6379`

## Staging

Staging should use production-like settings with non-production data and
credentials.

Required staging values:

- `NODE_ENV=staging`
- `MONGODB_URI`
- `RABBITMQ_URL`
- `ADMIN_API_KEY`
- `ADMIN_EMAIL`
- `PUBLIC_BOOKING_BASE_URL`
- `VITE_API_BASE_URL`
- `CALENDAR_TOKEN_ENCRYPTION_SECRET`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_STATE_SECRET`
- `PUBLIC_BOOKING_RATE_LIMIT_STORE`
- `REDIS_URL` when `PUBLIC_BOOKING_RATE_LIMIT_STORE=redis`

Use a long random `ADMIN_API_KEY`; staging uses the same validation rule as
production. Use staging Google OAuth credentials and redirect URIs.

If validating real email delivery in staging, set:

- `EMAIL_PROVIDER=smtp`
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

Otherwise keep `EMAIL_PROVIDER=console`.

## Production

Production required values:

- `NODE_ENV=production`
- `MONGODB_URI`
- `RABBITMQ_URL`
- `ADMIN_API_KEY`
- `ADMIN_EMAIL`
- `PUBLIC_BOOKING_BASE_URL`
- `VITE_API_BASE_URL`
- `CALENDAR_TOKEN_ENCRYPTION_SECRET`
- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `GOOGLE_CALENDAR_STATE_SECRET`
- `PUBLIC_BOOKING_RATE_LIMIT_STORE`
- `REDIS_URL` when `PUBLIC_BOOKING_RATE_LIMIT_STORE=redis`

Production email should use SMTP or a future dedicated provider:

- `EMAIL_PROVIDER=smtp`
- `EMAIL_FROM`
- `SMTP_HOST`
- `SMTP_PORT`
- `SMTP_SECURE`
- `SMTP_USER`
- `SMTP_PASSWORD`

Production secrets must come from the deployment platform or a secret manager,
not from committed files.

## Backend Config Validation

All backend services accept:

- `NODE_ENV=development`
- `NODE_ENV=test`
- `NODE_ENV=staging`
- `NODE_ENV=production`

The Call Requests Service requires `ADMIN_API_KEY` with at least 16 characters
when `NODE_ENV` is `staging` or `production`.

`CALENDAR_TOKEN_ENCRYPTION_SECRET` is required for Google Calendar token storage
to work. Without it, OAuth token protection will fail when calendar connection
features are used.

## Frontend Build-Time Config

The React frontend reads `VITE_API_BASE_URL` at build time. Build a separate
frontend artifact per environment when the API base URL differs.

Examples:

```env
VITE_API_BASE_URL=http://localhost:3000/api
```

```env
VITE_API_BASE_URL=https://api.staging.example.com/api
```

```env
VITE_API_BASE_URL=https://api.example.com/api
```

## Not Included Yet

This step does not add deployment automation, secret-manager integration, or
environment-specific infrastructure. Those remain separate Production Hardening
items.
