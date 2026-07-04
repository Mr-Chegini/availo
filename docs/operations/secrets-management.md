# Secrets Management

This runbook classifies Availo configuration values and defines where secrets
should come from in local, staging, and production environments.

This step documents the expected process. It does not integrate a cloud secret
manager yet.

## Secret Values

Treat these values as secrets:

- `MONGODB_URI` when it contains credentials or points to a managed database.
- `RABBITMQ_URL` when it contains credentials or points to a managed broker.
- `ADMIN_API_KEY`.
- `CALENDAR_TOKEN_ENCRYPTION_SECRET`.
- `GOOGLE_CALENDAR_CLIENT_SECRET`.
- `GOOGLE_CALENDAR_STATE_SECRET`.
- `REDIS_URL` when it contains credentials or points to a managed Redis
  service.
- `SMTP_USER`.
- `SMTP_PASSWORD`.

These values may also be sensitive depending on the environment:

- `GOOGLE_CALENDAR_CLIENT_ID`
- `GOOGLE_CALENDAR_REDIRECT_URI`
- `ADMIN_EMAIL`
- `EMAIL_FROM`
- `SMTP_HOST`

## Non-Secret Config

These values are normally non-secret configuration:

- `NODE_ENV`
- `CALL_REQUESTS_SERVICE_PORT`
- `SCHEDULER_SERVICE_PORT`
- `COMMUNICATION_SERVICE_PORT`
- `RABBITMQ_CALLS_EXCHANGE`
- `RABBITMQ_CALL_REQUESTED_QUEUE`
- `RABBITMQ_CALL_APPROVED_QUEUE`
- `RABBITMQ_CALL_REJECTED_QUEUE`
- `RABBITMQ_CALL_CANCELED_QUEUE`
- `RABBITMQ_CALL_REMINDER_QUEUE`
- `RABBITMQ_DAILY_DIGEST_QUEUE`
- `RABBITMQ_EMAIL_DEAD_LETTER_QUEUE`
- `RABBITMQ_CALL_APPROVED_SCHEDULER_QUEUE`
- `RABBITMQ_CALL_CANCELED_SCHEDULER_QUEUE`
- `RABBITMQ_CALL_RESCHEDULED_SCHEDULER_QUEUE`
- `PUBLIC_BOOKING_BASE_URL`
- `EMAIL_MAX_RETRY_ATTEMPTS`
- `EMAIL_PROVIDER`
- `SMTP_PORT`
- `SMTP_SECURE`
- `PUBLIC_BOOKING_RATE_LIMIT_WINDOW_SECONDS`
- `PUBLIC_BOOKING_RATE_LIMIT_LOOKUP_MAX`
- `PUBLIC_BOOKING_RATE_LIMIT_AVAILABILITY_MAX`
- `PUBLIC_BOOKING_RATE_LIMIT_CREATE_MAX`
- `PUBLIC_BOOKING_RATE_LIMIT_MANAGE_MAX`
- `PUBLIC_BOOKING_RATE_LIMIT_STORE`
- `VITE_API_BASE_URL`

## Local Development

Local development can use `.env` and `frontend/.env` files created from the
example files:

```bash
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Local `.env` files are ignored by git and must stay uncommitted.

Use development-only values locally:

- `ADMIN_API_KEY=dev-admin-key`
- Local MongoDB/RabbitMQ credentials from Docker Compose.
- Test Google OAuth credentials if calendar connection testing is needed.
- Test SMTP credentials only when validating email delivery.

Do not paste production or staging secrets into local `.env` files unless there
is an explicit incident/debugging need and the file is deleted immediately after
use.

## Staging

Staging secrets should come from the deployment platform secret store or a
dedicated secret manager.

Required staging secrets:

- `MONGODB_URI`
- `RABBITMQ_URL`
- `ADMIN_API_KEY`
- `CALENDAR_TOKEN_ENCRYPTION_SECRET`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_STATE_SECRET`
- `REDIS_URL` when Redis-backed rate limiting is enabled

Required when staging uses SMTP:

- `SMTP_USER`
- `SMTP_PASSWORD`

Staging must not reuse production secrets. Use separate MongoDB, RabbitMQ,
Google OAuth, SMTP, and admin API credentials.

## Production

Production secrets must come from the deployment platform secret store or a
dedicated secret manager.

Required production secrets:

- `MONGODB_URI`
- `RABBITMQ_URL`
- `ADMIN_API_KEY`
- `CALENDAR_TOKEN_ENCRYPTION_SECRET`
- `GOOGLE_CALENDAR_CLIENT_SECRET`
- `GOOGLE_CALENDAR_STATE_SECRET`
- `REDIS_URL` when Redis-backed rate limiting is enabled
- `SMTP_USER`
- `SMTP_PASSWORD`

Production secrets must not be stored in:

- Git-tracked files.
- Docker images.
- README snippets.
- CI logs.
- Shell history.
- Shared chat or ticket comments.

## Rotation Guidance

Rotate secrets immediately when exposed or suspected to be exposed.

Recommended routine rotation:

- `ADMIN_API_KEY`: at least every 90 days.
- SMTP credentials: at least every 180 days.
- Google OAuth client secret: at least annually or when staff access changes.
- Database and broker credentials: at least annually or when staff access
  changes.
- `CALENDAR_TOKEN_ENCRYPTION_SECRET`: do not rotate without a token migration
  plan, because existing protected calendar tokens depend on it.

## Access Control

Limit production secret access to people and automation that deploy or operate
production.

Minimum expectations:

- Separate staging and production secret access.
- Audit access where the platform supports it.
- Remove access when a team member no longer needs it.
- Prefer short-lived deployment credentials over shared long-lived credentials.

## Incident Checklist

If a secret is exposed:

1. Revoke or rotate the exposed secret.
2. Identify where the secret was exposed.
3. Remove the secret from logs, files, issues, or chats where possible.
4. Check whether the secret was used unexpectedly.
5. Deploy updated secrets.
6. Record the incident and follow-up tasks.

## Future Work

Before relying on paying customers, choose and integrate a concrete secret
source for staging and production, for example:

- The deployment platform's built-in secret store.
- AWS Secrets Manager.
- Google Secret Manager.
- HashiCorp Vault.

Do not add production deployment automation until the secret source is chosen.
