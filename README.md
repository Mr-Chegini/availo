# Call Reservation System

Distributed backend assignment for reserving 30-minute calls with an admin.

The system is built as an Nx monorepo with three NestJS services and one shared package:

- `call-requests-service`
- `scheduler-service`
- `communication-service`
- `@org/shared-types`

## Tech Stack

- Nx monorepo
- NestJS
- MongoDB
- RabbitMQ
- Docker / Docker Compose
- TypeScript

## Services

### Call Requests Service

The main API layer and source of truth for call requests.

Responsibilities:

- Create call requests
- Query availability
- List call requests for admin
- Approve/reject call requests
- Mark scheduled calls as called/canceled
- Update admin notes
- Store call request data in MongoDB
- Publish domain events to RabbitMQ

Main API prefix:

```text
http://localhost:3000/api
```

Important endpoints:

```http
GET    /api/call-requests
GET    /api/call-requests/availability?date=YYYY-MM-DD
POST   /api/call-requests
PATCH  /api/call-requests/:id/approve
PATCH  /api/call-requests/:id/reject
PATCH  /api/call-requests/:id/called
PATCH  /api/call-requests/:id/cancel
PATCH  /api/call-requests/:id/admin-note
```

Example create request:

```http
POST /api/call-requests
Content-Type: application/json
```

```json
{
  "email": "user@example.com",
  "phoneNumber": "+905551112233",
  "scheduledAt": "2026-05-15T10:00:00.000Z"
}
```

### Scheduler Service

Responsible for all time-based logic.

Responsibilities:

- Consume `call.approved`
- Store scheduled calls in its own MongoDB collection
- Publish reminder events before calls
- Publish daily digest events

Important architectural decision:

The Scheduler Service does not poll the Call Requests Service and does not query the call request collection directly. It builds its own state by consuming RabbitMQ events.

This keeps the scheduler independent and avoids service-to-service polling.

### Communication Service

Responsible for all email-related behavior.

For this assignment, actual emails are mocked with `console.log`.

Responsibilities:

- Consume call-related events from RabbitMQ
- Log mock email templates for:
  - call requested
  - call approved
  - call rejected
  - call canceled
  - call reminder
  - daily digest

To view mock emails, check the Docker logs:

```bash
docker logs communication-service
```

Or while running Compose:

```bash
docker compose logs -f communication-service
```

## Shared Types

Reusable DTOs, enums, and RabbitMQ event payloads live in:

```text
packages/shared-types
```

The package is imported as:

```ts
import { CallRequestStatus } from '@org/shared-types';
import type { CreateCallRequestDto } from '@org/shared-types';
```

## Environment Variables

Create a local `.env` file from `.env.example`:

```bash
cp .env.example .env
```

Example variables:

```env
NODE_ENV=development

CALL_REQUESTS_SERVICE_PORT=3000
SCHEDULER_SERVICE_PORT=3001
COMMUNICATION_SERVICE_PORT=3002

MONGODB_URI=mongodb://localhost:27017/call-reservation

RABBITMQ_URL=amqp://guest:guest@localhost:5672
RABBITMQ_CALLS_EXCHANGE=calls.exchange

RABBITMQ_CALL_REQUESTED_QUEUE=communication.call-requested
RABBITMQ_CALL_APPROVED_QUEUE=communication.call-approved
RABBITMQ_CALL_REJECTED_QUEUE=communication.call-rejected
RABBITMQ_CALL_CANCELED_QUEUE=communication.call-canceled
RABBITMQ_CALL_REMINDER_QUEUE=communication.call-reminder
RABBITMQ_DAILY_DIGEST_QUEUE=communication.daily-digest

RABBITMQ_CALL_APPROVED_SCHEDULER_QUEUE=scheduler.call-approved

ADMIN_EMAIL=admin@example.com
```

Do not commit the real `.env` file.

## Running with Docker Compose

The Docker Compose file is inside the `scripts` folder.

From the root project directory:

```bash
cd scripts
docker compose up --build
```

Services:

```text
MongoDB:                 localhost:27017
RabbitMQ AMQP:           localhost:5672
RabbitMQ Management UI:  http://localhost:15672
Call Requests Service:   http://localhost:3000/api
Scheduler Service:       http://localhost:3001
Communication Service:   http://localhost:3002
```

RabbitMQ dashboard login:

```text
username: guest
password: guest
```

## Running Locally Without Docker

Start MongoDB and RabbitMQ manually, then run services separately:

```bash
npx nx serve @org/call-requests-service
npx nx serve @org/scheduler-service
npx nx serve @org/communication-service
```

## Build Commands

Build all main services:

```bash
npx nx build @org/shared-types
npx nx build @org/call-requests-service
npx nx build @org/scheduler-service
npx nx build @org/communication-service
```

## Booking Rules

- Working hours are 10:00 to 18:00 Istanbul time
- Calls are Monday to Friday only
- Weekend bookings are rejected
- Past dates are rejected
- Same-day bookings are rejected
- Calls are always 30 minutes
- Call start time must be on a 30-minute boundary, for example:
  - `10:00`
  - `10:30`
  - `11:00`

## Call Request Lifecycle

```text
REQUESTED
  ├── approved  → SCHEDULED
  └── rejected  → REJECTED

SCHEDULED
  ├── marked as called → CALLED
  └── canceled         → CANCELED
```

## RabbitMQ Events

The system uses a topic exchange:

```text
calls.exchange
```

Routing keys:

```text
call.requested
call.approved
call.rejected
call.canceled
call.reminder
call.daily-digest
```

## Reminder Timing Assumption

The assignment text mentions both:

- 30 minutes before call reminder
- 2 hours before scheduled call reminder

This implementation follows the lifecycle table and sends reminder events 2 hours before the scheduled call.

## Daily Digest

The Scheduler Service publishes a daily digest event for scheduled calls.

The Communication Service consumes this event and logs one admin digest email.

## Mock Emails

Emails are not actually sent. They are logged by the Communication Service.

Example:

```bash
docker compose logs -f communication-service
```

You should see logs for templates such as:

```text
CALL_REQUESTED
CALL_APPROVED
CALL_REJECTED
CALL_CANCELED
CALL_REMINDER_CUSTOMER
CALL_REMINDER_ADMIN
DAILY_DIGEST
```

## Frontend Status

A simple frontend/admin UI is part of the assignment scope.

Planned views:

- User View:
  - Show availability
  - Submit a call request
- Admin View:
  - List call requests
  - Approve/reject requests
  - Mark scheduled calls as called/canceled
  - Edit admin notes

The backend APIs are prepared for these frontend actions.

## Commit Convention

This repository uses Conventional Commits.

Examples:

```text
chore: initialize nx monorepo with services
feat: add call request creation endpoint
feat: publish call requested events
feat: consume approval email events
chore: dockerize backend services
docs: add project setup and architecture notes
```