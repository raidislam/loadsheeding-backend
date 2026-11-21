# Load Shedding & Power Outage Management System — Backend

Express 5 + TypeScript + Prisma 7 + PostgreSQL (Neon).

## Getting started

1. `npm install` (also runs `prisma generate`)
2. Copy `.env.example` to `.env` and fill it in:
   - `DATABASE_URL`: Neon **pooled** connection string, used by the app
   - `DIRECT_URL`: Neon **direct** connection string (host without `-pooler`), used by Prisma migrate
   - `ADMIN_NAME`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`: credentials for the first admin account
3. `npm run prisma:deploy` applies migrations to the database
4. `npm run seed` creates the admin. The server also does this on startup, and skips it if the admin already exists.
5. `npm run dev` starts the server at `http://localhost:5000`

## Project structure

```
prisma/
  schema/              one .prisma file per area (enums, user, network, outage, assignment, ...)
  migrations/          SQL migrations
src/
  server.ts            connect DB, seed admin, listen
  app.ts               helmet, cors, body parsers, rate limit, routes, error handler
  app/
    config/            env values
    lib/prisma.ts      Prisma client (pooled URL)
    middleware/        validateRequest (zod), rateLimiter, globalErrorHandler, notFound
    module/<name>/     <name>.route / .controller / .service / .validation / .interface
    scripts/           seedAdmin.ts
    utils/             AppError, catchAsync, sendResponse, jwt, seed
    interfaces/        shared types
```

## Response format

```jsonc
// success
{ "success": true, "message": "...", "meta": { "page": 1, "limit": 10, "total": 25, "totalPages": 3 }, "data": {} }
// error
{ "success": false, "message": "Validation failed", "errors": [{ "path": "email", "message": "Invalid email" }] }
```

## Database design

13 models. Diagram of the relationships:

```
DistributionZone 1──* Substation 1──* Feeder 1──* Area
                                                   │
             ┌───────────────────────┬─────────────┼──────────────────┐
             *                       *             *                  *
          Outage ◄──0..1── OutageReport        User (customer.areaId)
     (createdBy: Admin)    (customer: User)
                                  │ 1
                                  │ 0..1
                       TechnicianAssignment ──* RepairRecord
                     (technician, assignedBy: User)

User 1──* Notification     User 1──* Bill 1──* Payment     User 0..1──* AuditLog
```

| Model | Notes |
|---|---|
| User | One table for ADMIN, CUSTOMER and TECHNICIAN. `email` and `meterNumber` are unique. Stores a hash of the refresh token. Soft deletable |
| DistributionZone / Substation / Feeder / Area | Network hierarchy. `code` is unique. Soft deletable. A parent cannot be hard-deleted while children exist (`Restrict`) |
| Outage | SCHEDULED or UNEXPECTED. Belongs to one Area, and zone, substation and feeder are read through it. Soft deletable |
| OutageReport | Submitted by a customer. Can optionally be linked to an Outage |
| TechnicianAssignment | `reportId` is unique, so a report has at most one assignment. Status flow: ASSIGNED → ACCEPTED → IN_PROGRESS → COMPLETED |
| RepairRecord | Repair report for an assignment |
| Notification | Belongs to a user. Index on `(userId, isRead)` |
| Bill | Monthly bill. `(customerId, billMonth)` is unique |
| Payment | One SSLCommerz attempt for a bill. `transactionId` is unique |
| AuditLog | Who did what to which record. `userId` is null for system actions |

## Scripts

| Script | What it does |
|---|---|
| `dev` | Run with tsx watch |
| `build` / `start` | Bundle with tsup / run `dist/server.js` |
| `seed` | Create the admin from `.env` (safe to run again) |
| `prisma:migrate` | Create and apply a new migration in development (interactive terminal) |
| `prisma:deploy` | Apply existing migrations |
| `prisma:studio` | Open the DB browser |
| `lint:check` / `format:fix` | Biome |

API checklist: see [API_CHECKLIST.md](./API_CHECKLIST.md).
