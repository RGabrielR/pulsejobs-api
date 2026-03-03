# PulseJobs API

PulseJobs API is a production-style NestJS backend MVP for asynchronous spreadsheet import processing.

## Overview

The API lets authenticated users upload spreadsheet files that are processed asynchronously. Every import becomes a job with lifecycle state, retries, row-level validation output, and attempt-level audit records.

## Features

- JWT authentication (`register`, `login`)
- Role-based access control (`ADMIN`, `USER`)
- Async job processing without external queues
- Spreadsheet parsing (`.csv`, `.xlsx`, `.xls`, `.xlsm`, `.xlsb`, `.xltx`, `.xltm`) + validation + normalization
- Smart flexible ingestion (header detection, normalization, canonical mapping and fallback mode)
- Row-level result persistence (`SUCCESS`, `FAILED`, `WARNING`)
- Job retries with attempt history
- Swagger/OpenAPI docs at `/api/docs`
- Global request validation and structured error responses
- Helmet + throttling
- PostgreSQL + Prisma

## Architecture

Modules:

- `src/auth`
- `src/users`
- `src/jobs`
- `src/uploads`
- `src/health`
- `src/prisma`
- `src/common`

High-level flow:

1. `POST /api/jobs/import` uploads a spreadsheet file.
2. API stores upload metadata and creates a `PENDING` job.
3. Background processor starts asynchronously.
4. Processor validates and normalizes each row.
5. Processor stores row-level `JobResultItem` records.
6. Job transitions to `COMPLETED`, `PARTIALLY_COMPLETED`, or `FAILED`.
7. API exposes job detail, paginated results, and summary endpoints.

## Domain Model

Prisma entities:

- `User`
- `Upload`
- `Job`
- `JobAttempt`
- `JobResultItem`

Enums:

- `Role`: `ADMIN`, `USER`
- `JobType`: `CSV_IMPORT`
- `JobStatus`: `PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `PARTIALLY_COMPLETED`
- `JobAttemptStatus`: `PROCESSING`, `COMPLETED`, `FAILED`, `PARTIALLY_COMPLETED`
- `JobResultStatus`: `SUCCESS`, `FAILED`, `WARNING`
- `ParserMode`: `CANONICAL`, `FLEXIBLE`

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and set values:

- `DATABASE_URL`
- `JWT_SECRET`
- `JWT_EXPIRES_IN (seconds)`
- `PORT`

Example PostgreSQL URL:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/pulsejobs?schema=public"
```

### 3. Generate Prisma client

```bash
npm run prisma:generate
```

### 4. Run migrations

```bash
npx prisma migrate deploy
```

For local development migration creation:

```bash
npm run prisma:migrate -- --name init
```

### 5. Seed initial users

```bash
npm run db:seed
```

### 6. Run app

```bash
npm run start:dev
```

App base URL: `http://localhost:3000/api`

Swagger docs: `http://localhost:3000/api/docs`

## Cloud Run Deploy

Two helper scripts are included:

- `scripts/deploy-cloud-run.sh` (bash)
- `scripts/deploy-cloud-run.ps1` (PowerShell)

PowerShell example:

```powershell
.\scripts\deploy-cloud-run.ps1 `
  -ProjectId "my-gcp-project" `
  -DatabaseUrl "postgresql://USER:PASS@HOST/DB?sslmode=require" `
  -JwtSecret "replace-with-a-long-secret"
```

Bash example:

```bash
PROJECT_ID="my-gcp-project" \
DATABASE_URL="postgresql://USER:PASS@HOST/DB?sslmode=require" \
JWT_SECRET="replace-with-a-long-secret" \
./scripts/deploy-cloud-run.sh
```

Both scripts:

- enable required Google APIs
- create or update `DATABASE_URL` and `JWT_SECRET` in Secret Manager
- deploy Cloud Run with low-cost defaults (`min-instances=0`, `max-instances=3`)

## API Endpoints

### Auth

- `POST /api/auth/register`
- `POST /api/auth/login`

### Health

- `GET /api/health`

### Users

- `GET /api/users/me`

### Jobs

- `POST /api/jobs/import`
- `GET /api/jobs`
- `GET /api/jobs/metrics/overview` (admin only)
- `GET /api/jobs/:id`
- `GET /api/jobs/:id/results`
- `POST /api/jobs/:id/retry` (admin only)
- `GET /api/jobs/:id/download-summary`

## Flexible Ingestion Strategy

The importer behaves as a smart ingestion engine instead of a strict template validator:

1. Reads CSV or first worksheet from Excel files.
2. Detects the most likely header row by scanning the first 10 rows.
3. If no clear header row exists, falls back to generated headers (`column_1`, `column_2`, ...).
4. Normalizes headers (trim, lowercase, remove accents, snake_case conversion).
5. Tries to map normalized headers to canonical fields (`name`, `email`, `department`, `salary`) using synonyms and confidence scoring.
6. If mapping confidence is low, continues in `FLEXIBLE` mode instead of failing the job.
7. Stores `rawData`, normalized values, inferred data types and row-level warnings.
8. Uses tolerant validation:
   - validates canonical fields when they are mapped
   - missing canonical fields become warnings, not fatal job errors

The job fails only for unreadable/corrupted files, empty usable data, or unexpected processing crashes.

## Sample Seed Users

- Admin:
  - email: `admin@pulsejobs.dev`
  - password: `Admin123!`
- User:
  - email: `user@pulsejobs.dev`
  - password: `User12345!`

## Scripts

- `npm run start:dev` - run app in watch mode
- `npm run build` - build project
- `npm run test` - run unit tests
- `npm run test:e2e` - run e2e tests
- `npm run test:integration` - run PostgreSQL integration flow tests
- `npm run prisma:generate` - generate Prisma client
- `npm run prisma:migrate` - create/apply dev migration
- `npm run prisma:migrate:deploy` - apply existing migrations
- `npm run db:seed` - seed sample users

## Testing

Included tests:

- auth service unit tests
- jobs service unit tests
- health controller test
- health e2e smoke test
- PostgreSQL integration test for login + import + retry (`test/jobs.integration-spec.ts`)

Integration notes:

- `test:integration` runs only when `RUN_INTEGRATION_TESTS=true` and `DATABASE_URL` are present.
- Use a dedicated test database URL to avoid wiping development data.

## Future Improvements

- Replace in-process async scheduling with a real queue (BullMQ/Redis)
- Add dead-letter/error policy and retry backoff strategies
- Add object storage integration for uploaded files
- Add richer audit log queries and observability metrics
- Add stricter spreadsheet schema versioning
