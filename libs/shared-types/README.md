# Shared Types

Common TypeScript contracts used by the call reservation services and the
frontend.

This package contains:

- call request statuses and DTOs
- RabbitMQ exchange and routing key names
- event payload shapes shared between producers and consumers

Keep this package free of runtime service logic. It should describe the data
crossing service boundaries, not decide how a service handles that data.
