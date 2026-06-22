# MongoDB Backup And Restore Runbook

This runbook covers the current Docker Compose MongoDB setup for Availo.

Current local Compose details:

- Compose file: `scripts/docker-compose.yml`
- MongoDB service: `mongodb`
- MongoDB container: `call-reservation-mongodb`
- MongoDB volume: `mongodb_data`
- Database name: `call-reservation`
- Local URI: `mongodb://localhost:27017/call-reservation`
- In-Compose URI: `mongodb://mongodb:27017/call-reservation`

## Local Backup

Start the stack from the repository root:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml up -d mongodb
```

Create a timestamped backup directory:

```bash
mkdir -p backups/mongodb
```

Run `mongodump` inside the MongoDB container:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml exec mongodb \
  mongodump --db call-reservation --archive=/tmp/call-reservation.archive --gzip
```

Copy the archive to the host:

```bash
docker cp call-reservation-mongodb:/tmp/call-reservation.archive \
  backups/mongodb/call-reservation-$(date +%Y%m%d-%H%M%S).archive.gz
```

Remove the temporary archive from the container:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml exec mongodb \
  rm -f /tmp/call-reservation.archive
```

## Local Restore

Stop app services before restoring so no service writes while the restore is in
progress:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml stop \
  call-requests-service scheduler-service communication-service
```

Copy a backup archive into the MongoDB container:

```bash
docker cp backups/mongodb/<backup-file>.archive.gz \
  call-reservation-mongodb:/tmp/call-reservation.archive.gz
```

Restore the database. The `--drop` flag removes existing collections before
restoring them from the archive.

```bash
docker compose --env-file .env -f scripts/docker-compose.yml exec mongodb \
  mongorestore --db call-reservation --archive=/tmp/call-reservation.archive.gz \
  --gzip --drop
```

Remove the temporary archive from the container:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml exec mongodb \
  rm -f /tmp/call-reservation.archive.gz
```

Restart app services:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml up -d \
  call-requests-service scheduler-service communication-service
```

## Restore Verification

Check MongoDB responds:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml exec mongodb \
  mongosh call-reservation --eval "db.adminCommand('ping')"
```

Check collection counts:

```bash
docker compose --env-file .env -f scripts/docker-compose.yml exec mongodb \
  mongosh call-reservation --eval "db.getCollectionNames().forEach((name) => print(name + ': ' + db.getCollection(name).countDocuments()))"
```

Check the API health endpoint:

```bash
curl http://localhost:3000/health
```

## Staging And Production Requirements

Do not rely on the local Docker volume as a production backup.

Before production launch:

- Store backups off-host in durable object storage.
- Encrypt backup archives before upload or use storage-side encryption with
  restricted key access.
- Use least-privilege credentials for backup and restore jobs.
- Define retention, for example daily backups for 14 days and weekly backups
  for 8 weeks.
- Run a restore drill at least once per release cycle and record the result.
- Alert on backup job failures.
- Keep restore instructions accessible during an incident.
- Test restores into an isolated environment before restoring production.

## Safety Notes

- `mongorestore --drop` is destructive. Use it only when replacing the target
  database is intended.
- Take a fresh backup before any restore into an environment that contains data
  you may need.
- Stop writers before restoring to avoid mixing old and new data.
- For production, schedule a maintenance window or restore into a replacement
  database and cut traffic over after verification.
