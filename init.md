You are a senior backend engineer. Build a production-style MVP called **PulseJobs API** on top of an existing **NestJS** project.

## Goal

Create a backend portfolio project that demonstrates:

* clean NestJS architecture
* async job processing
* PostgreSQL with Prisma
* JWT auth + role-based access
* Swagger docs
* DTO validation
* structured error handling
* auditability and retries

This project should feel like a real internal platform API, not a toy CRUD.

## Product concept

PulseJobs API is an asynchronous file import and validation backend.

A user uploads a CSV file. The system:

1. creates a Job
2. stores upload metadata
3. marks the job as `pending`
4. processes the file asynchronously
5. validates rows
6. normalizes data
7. stores processing results
8. exposes job status and result summaries through the API

The main purpose is to demonstrate backend architecture patterns:

* job lifecycle management
* background processing
* retry support
* status tracking
* structured validation results
* audit trail

## Technical constraints

Use:

* NestJS
* TypeScript
* Prisma
* PostgreSQL
* Swagger / OpenAPI
* class-validator + class-transformer
* @nestjs/config
* JWT auth
* Helmet
* Throttler
* Jest for basic tests

Do **not** add Redis, BullMQ, Kafka, Docker, S3, or external paid services in this first version.

## Architecture requirements

Use a modular structure like:

* `src/auth`
* `src/users`
* `src/jobs`
* `src/uploads`
* `src/common`
* `src/prisma`
* `src/health`

Inside `common`, include reusable concerns such as:

* filters
* interceptors if useful
* decorators if useful
* enums
* helpers

Use a clear separation between:

* controllers
* services
* DTOs
* Prisma access
* domain enums / constants

## Main domain

Implement these entities in Prisma:

### User

* id
* email
* passwordHash
* role (`ADMIN`, `USER`)
* createdAt
* updatedAt

### Upload

* id
* originalFileName
* mimeType
* size
* storagePath or local path reference
* createdAt
* uploadedById

### Job

* id
* type (`CSV_IMPORT`)
* status (`PENDING`, `PROCESSING`, `COMPLETED`, `FAILED`, `PARTIALLY_COMPLETED`)
* uploadedById
* uploadId
* totalRows
* processedRows
* failedRows
* startedAt
* finishedAt
* lastError
* createdAt
* updatedAt

### JobAttempt

* id
* jobId
* attemptNumber
* status
* startedAt
* finishedAt
* errorMessage

### JobResultItem

* id
* jobId
* rowNumber
* status (`SUCCESS`, `FAILED`)
* message
* rawData (Json)
* normalizedData (Json nullable)

Use proper relations and indexes where reasonable.

## CSV processing behavior

Implement an MVP CSV import processor with this behavior:

* Accept CSV uploads
* Parse rows
* Validate required columns:

  * `name`
  * `email`
  * `department`
  * `salary`
* Validate:

  * email format
  * salary must be numeric and > 0
  * name cannot be empty
* Normalize:

  * trim whitespace
  * lowercase email
  * uppercase department
* For each row:

  * mark success or failure
  * persist per-row result
* At the end:

  * update job counters
  * set final job status:

    * `COMPLETED` if all rows succeeded
    * `PARTIALLY_COMPLETED` if some rows failed
    * `FAILED` if processing crashed before completion

## Async processing approach

Do not use external queue infrastructure.

Instead:

* create the job first in `PENDING`
* save upload metadata
* trigger processing in an async service flow after upload
* persist job attempt records
* support retrying failed or partially completed jobs through an endpoint

A simple approach is acceptable, such as:

* service-level async execution
* or a lightweight polling/worker pattern inside the app

But keep the code organized so that a real queue could be added later.

## Auth requirements

Implement:

* register
* login
* JWT auth guard
* roles guard

Rules:

* normal users can create and view their own jobs
* admins can view all jobs and retry any job

Seed at least:

* one admin user
* one normal user

## Required endpoints

### Auth

* `POST /auth/register`
* `POST /auth/login`

### Health

* `GET /health`

### Jobs

* `POST /jobs/import` → upload a CSV and create a job
* `GET /jobs` → list jobs
* `GET /jobs/:id` → get job details
* `GET /jobs/:id/results` → paginated row-level results
* `POST /jobs/:id/retry` → retry processing
* `GET /jobs/:id/download-summary` → optional JSON summary endpoint

### Users

* `GET /users/me`

## Swagger requirements

Set up Swagger properly:

* title: `PulseJobs API`
* description explaining async CSV import processing
* bearer auth support
* tags by module
* DTOs documented clearly
* response schemas documented where practical

## Validation and error handling

Use global ValidationPipe with:

* whitelist
* forbidNonWhitelisted
* transform

Add a global exception filter or consistent error formatting.

Return clean API responses.

## Security and app bootstrap

In `main.ts`:

* enable Helmet
* enable global validation
* set a global prefix like `/api`
* configure Swagger at `/api/docs`

Add rate limiting for sensitive routes if practical.

## Prisma and DB requirements

* create a Prisma service/module
* include initial migration
* include seed script
* provide `.env.example`
* assume PostgreSQL

## Testing

Add at least:

* one auth e2e or integration-style test
* one jobs service/unit or integration test
* one health test

Tests do not need to be exhaustive, but the project should not look untested.

## Developer experience

Include:

* clear scripts in `package.json`
* README with:

  * project overview
  * features
  * architecture
  * setup
  * env vars
  * database migration commands
  * seed command
  * run instructions
  * API docs URL
  * sample users
  * future improvements

## Code quality expectations

* Use strict TypeScript-friendly code
* Prefer readable naming
* Avoid overengineering
* Keep files reasonably organized
* Use DTOs everywhere for input/output boundaries
* Add comments only where they help explain intent
* Make the code feel like something a strong backend engineer would show in a portfolio

## Deliverables

Generate all code and files needed for a working MVP, including:

* Nest modules
* Prisma schema
* migration-ready setup
* seed script
* README
* `.env.example`

At the end, also provide:

1. a short explanation of architecture decisions
2. exact commands to run locally
3. any follow-up tasks you recommend next
