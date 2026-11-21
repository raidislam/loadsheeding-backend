# Load Shedding & Power Outage Management System — Backend

A REST API for managing electricity distribution, scheduled load shedding, unexpected outages reported by customers, technician repair work, and electricity bill payments through SSLCommerz.

---

## 1. Project overview and features

```
Distribution Zone → Substation → Feeder → Area
                                           │
                    ┌──────────────────────┴──────────────────────┐
             Scheduled outage                              Unexpected outage
      (admin plans it, customers in                 (customer reports it → admin reviews
       the area get a notification)                  → technician assigned → repair → power restored)
```

| Role | What they can do |
|---|---|
| **ADMIN** | Manage the network (zones, substations, feeders, areas), create and update outages, review customer reports, assign technicians, create bills, manage users (create technicians, change roles, block or unblock), view dashboard statistics and audit logs |
| **CUSTOMER** | Register, manage their profile, view outages, report unexpected outages and track them, read notifications, pay electricity bills, view payment history |
| **TECHNICIAN** | View assigned jobs, accept and start jobs, submit repair reports (which restores power), view job history |

Other features:
- **Notifications**: customers are told about outages in their area, report updates, power restoration and bills.
- **Audit log**: every important action records who did what, and when.
- **Soft delete**: network items and outages are hidden, not removed.
- **Transactions**: multi-step operations (for example, completing a repair) either fully succeed or fully roll back.
- **SSLCommerz sandbox**: real payment integration with server-side verification.

## 2. Technology stack

| Purpose | Technology |
|---|---|
| Runtime and language | Node.js, TypeScript |
| Web framework | Express 5 |
| Database | PostgreSQL on [Neon](https://neon.tech) |
| ORM | Prisma 7 (with the `@prisma/adapter-pg` driver) |
| Validation | Zod 4 |
| Authentication | JWT (`jsonwebtoken`), passwords hashed with bcrypt (`bcryptjs`) |
| Security | Helmet, CORS, express-rate-limit |
| Payments | SSLCommerz (sandbox), called with the built-in `fetch` |
| Tooling | tsx (dev server), tsup (build), Biome (lint and format) |

## 3. Prerequisites

- **Node.js 20 or newer** (developed on Node 22) and npm
- A **Neon** PostgreSQL database (the free plan is enough)
- An **SSLCommerz sandbox** account: https://developer.sslcommerz.com/registration/

## 4. Installation

```bash
git clone <your-repo-url>
cd loadsheeding-backend
npm install          # also runs "prisma generate"
cp .env.example .env # then fill in the values (see the next section)
```

## 5. Environment variables

All values live in `.env`. **Never commit `.env`**; it is already listed in `.gitignore`. `.env.example` contains placeholders only.

| Variable | Example / default | Meaning |
|---|---|---|
| `NODE_ENV` | `development` | In `production`, error responses hide internal messages and stack traces |
| `PORT` | `5000` | Server port |
| `DATABASE_URL` | `postgresql://USER:PASSWORD@HOST-pooler.neon.tech/DB?sslmode=require` | Neon **pooled** URL, used by the app |
| `DIRECT_URL` | `postgresql://USER:PASSWORD@HOST.neon.tech/DB?sslmode=require` | Neon **direct** URL (host without `-pooler`), used by Prisma migrations |
| `JWT_ACCESS_SECRET` | 64 random hex characters | Signs access tokens. Must be at least 32 characters |
| `JWT_REFRESH_SECRET` | another 64 random hex characters | Signs refresh tokens. **Must be different** from the access secret |
| `JWT_ACCESS_EXPIRES_IN` | `15m` | Access token lifetime |
| `JWT_REFRESH_EXPIRES_IN` | `7d` | Refresh token lifetime |
| `BCRYPT_SALT_ROUNDS` | `10` | bcrypt cost |
| `BACKEND_URL` | `http://localhost:5000` | Public URL of this API (used for SSLCommerz callbacks) |
| `FRONTEND_URL` | `http://localhost:3000` | The only origin allowed by CORS. Payment redirects go here |
| `ADMIN_NAME` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` | `System Admin` / `admin@example.com` / a strong password | The first admin account (see section 7) |
| `RATE_LIMIT_MAX` | `100` | Requests per IP per 15 minutes on `/api/v1` |
| `AUTH_RATE_LIMIT_MAX` | `10` | **Failed** login or register attempts per IP per 15 minutes |
| `SSLCOMMERZ_STORE_ID` / `SSLCOMMERZ_STORE_PASSWORD` | from the SSLCommerz sandbox | Store credentials |
| `SSLCOMMERZ_IS_LIVE` | `false` | `false` = sandbox, `true` = real money |
| `SSLCOMMERZ_SUCCESS_URL`, `_FAIL_URL`, `_CANCEL_URL`, `_IPN_URL` | *(empty)* | Leave empty to use `BACKEND_URL/api/v1/payments/success` (and `/fail`, `/cancel`, `/ipn`) |

Generate a secret:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

The server **refuses to start** if the JWT secrets are missing, shorter than 32 characters, or identical.

## 6. Database setup and migration

1. Create a project on Neon. Copy the **pooled** connection string into `DATABASE_URL`, and the same string **without `-pooler`** in the host into `DIRECT_URL`.
2. Create the tables:

```bash
npm run prisma:deploy     # applies prisma/migrations to the database
npx prisma migrate status # should print "Database schema is up to date!"
```

When you change the schema later (files in `prisma/schema/`), create a new migration with `npm run prisma:migrate -- --name <change-name>` in an interactive terminal.

The database has 13 tables: users, distribution_zones, substations, feeders, areas, outages, outage_reports, technician_assignments, repair_records, notifications, bills, payments and audit_logs. See section 16 for the diagram.

## 7. Admin seed

Customers register themselves; technicians are created by an admin. The **first admin** comes from `.env`:

```bash
npm run seed
```

- The password is hashed with bcrypt.
- Running it again is safe: if the admin email already exists, it does nothing.
- The server also runs this seed automatically on every start.
- Change `ADMIN_PASSWORD` before going live. After the admin exists, change the password with `PATCH /api/v1/users/me/change-password`.

## 8. Start the development server

```bash
npm run dev        # http://localhost:5000, restarts on file changes
curl http://localhost:5000/
# {"success":true,"message":"Load Shedding & Power Outage Management API is running","data":null}
```

Production build: `npm run build`, then `npm start`.

## 9. Authentication and role permissions

**Login flow**

1. `POST /api/v1/auth/login` returns an `accessToken` (valid for 15 minutes) and a `refreshToken` (valid for 7 days).
2. Send `Authorization: Bearer <accessToken>` with every protected request.
3. When the access token expires, call `POST /api/v1/auth/refresh-token` with `{ "refreshToken": "..." }` to get a **new pair**. The old refresh token stops working (rotation).
4. `POST /api/v1/auth/logout` ends the session.

**Security rules**

- The user's **role is always read from the database**, never from the request. Public registration always creates a `CUSTOMER`, even if `role` is sent.
- Passwords are stored as bcrypt hashes. Only a SHA-256 hash of the refresh token is stored.
- Logout, password change, role change and blocking all delete the stored refresh token hash, so the existing access token **stops working immediately**.
- One active session per user: logging in on a new device ends the session on the old one.
- Blocked users get `403` on every request and can't log in.

**Permission matrix**

| Feature | Public | CUSTOMER | TECHNICIAN | ADMIN |
|---|:-:|:-:|:-:|:-:|
| View zones, substations, feeders, areas, outages | ✅ | ✅ | ✅ | ✅ |
| Create, update or delete network items and outages | | | | ✅ |
| Own profile, change password, notifications | | ✅ | ✅ | ✅ |
| Submit and track own outage reports | | ✅ | | |
| See all reports, review them, assign technicians | | | | ✅ |
| Accept, start and complete **own** jobs | | | ✅ | |
| View own bills, pay bills, payment history | | ✅ | | |
| Create bills, admin dashboard, users, audit logs | | | | ✅ |

**Ownership (IDOR protection)**
- A customer opening another customer's report, bill or notification gets `404`.
- A technician opening another technician's job gets `403`.
- An admin can't change their own role or block themselves, and the **last active admin** can't be blocked or demoted.

## 10. API endpoints (64)

Base URL: `http://localhost:5000/api/v1`. 🔓 = public, 🔒 = needs `Authorization: Bearer <accessToken>`.
List endpoints accept `page` and `limit` (see section 12). `:id` must be a UUID, otherwise the response is `400`.

### Auth (4)

| Method | Path | Access | Body |
|---|---|---|---|
| POST | `/auth/register` | 🔓 | `{ name, email, password, phone?, address?, meterNumber?, areaId? }`. Password: 8+ characters with a letter and a number. Phone: Bangladeshi format `01XXXXXXXXX` |
| POST | `/auth/login` | 🔓 | `{ email, password }` |
| POST | `/auth/refresh-token` | 🔓 | `{ refreshToken }` |
| POST | `/auth/logout` | 🔒 any role | none |

```jsonc
// POST /auth/login -> 200
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": { "id": "…", "name": "Rahim", "email": "rahim@example.com", "role": "CUSTOMER", "status": "ACTIVE", "areaId": "…", "meterNumber": null, "createdAt": "…" },
    "accessToken": "eyJhbGciOi…",
    "refreshToken": "eyJhbGciOi…"
  }
}
```

### My profile (3)

| Method | Path | Access | Body |
|---|---|---|---|
| GET | `/users/me` | 🔒 any role | Returns the profile with the area → feeder → substation → zone path |
| PATCH | `/users/me` | 🔒 any role | `{ name?, phone?, address?, meterNumber?, areaId? }`. Only customers can set `meterNumber` and `areaId`; email and role can't be changed here |
| PATCH | `/users/me/change-password` | 🔒 any role | `{ currentPassword, newPassword }`. Logs the user out everywhere |

### Electricity network (20)

The same 5 endpoints exist for **zones**, **substations**, **feeders** and **areas**:

| Method | Path | Access | Body / Query |
|---|---|---|---|
| POST | `/zones` | 🔒 ADMIN | `{ name, code, description? }` |
| GET | `/zones` | 🔓 | `?page&limit&sortBy=name\|code\|createdAt&sortOrder&searchTerm` |
| GET | `/zones/:id` | 🔓 | Includes its substations |
| PATCH | `/zones/:id` | 🔒 ADMIN | Any create field |
| DELETE | `/zones/:id` | 🔒 ADMIN | Soft delete. `409` if it still has active substations |
| POST | `/substations` | 🔒 ADMIN | `{ name, code, zoneId, capacityMW?, address? }` |
| GET | `/substations` | 🔓 | Same query as zones, plus `zoneId`. `sortBy` can also be `capacityMW` |
| GET | `/substations/:id` | 🔓 | Includes its zone and feeders |
| PATCH | `/substations/:id` | 🔒 ADMIN | Any create field |
| DELETE | `/substations/:id` | 🔒 ADMIN | `409` if it still has active feeders |
| POST | `/feeders` | 🔒 ADMIN | `{ name, code, substationId, voltageKV? }` |
| GET | `/feeders` | 🔓 | Same query as zones, plus `substationId` and `zoneId` |
| GET | `/feeders/:id` | 🔓 | Includes its substation, zone and areas |
| PATCH | `/feeders/:id` | 🔒 ADMIN | Any create field |
| DELETE | `/feeders/:id` | 🔒 ADMIN | `409` if it still has active areas |
| POST | `/areas` | 🔒 ADMIN | `{ name, code, feederId }` |
| GET | `/areas` | 🔓 | Same query as zones, plus `feederId`, `substationId` and `zoneId`. `searchTerm` also matches feeder, substation and zone names |
| GET | `/areas/:id` | 🔓 | Full path, plus customer and outage counts |
| PATCH | `/areas/:id` | 🔒 ADMIN | Any create field |
| DELETE | `/areas/:id` | 🔒 ADMIN | `409` if it still has customers, active outages or open reports |

Codes are stored in UPPERCASE (`dhk-n` becomes `DHK-N`) and must be unique, including deleted rows.

```jsonc
// GET /areas?zoneId=…&page=1&limit=10 -> 200
{
  "success": true,
  "message": "Areas retrieved successfully",
  "meta": { "page": 1, "limit": 10, "total": 2, "totalPages": 1 },
  "data": [
    { "id": "…", "name": "Uttara Sector 7", "code": "DHK-UTT-7",
      "feeder": { "id": "…", "name": "Feeder 11kV", "code": "…",
        "substation": { "id": "…", "name": "Uttara Grid", "code": "…",
          "zone": { "id": "…", "name": "Dhaka North", "code": "DHK-N" } } } }
  ]
}
```

### Outages (6)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| POST | `/outages` | 🔒 ADMIN | `{ title, type?: "SCHEDULED"\|"UNEXPECTED", areaId, startTime, expectedRestoreTime, reason, description? }`. A SCHEDULED outage must start in the future. All customers in the area are notified |
| GET | `/outages` | 🔓 | `?page&limit&sortBy=startTime\|expectedRestoreTime\|createdAt\|status&sortOrder&status&type&areaId&feederId&substationId&zoneId&from&to` |
| GET | `/outages/search` | 🔓 | `?q=Uttara&page&limit`. Searches the title, reason, description and area, feeder, substation and zone names |
| GET | `/outages/:id` | 🔓 | Full path, plus the number of linked reports |
| PATCH | `/outages/:id` | 🔒 ADMIN | `{ title?, reason?, description?, startTime?, expectedRestoreTime?, status? }`. Status flow: `SCHEDULED → ONGOING / CANCELLED`, `ONGOING → RESOLVED` (sets `actualRestoreTime`). Customers are notified |
| DELETE | `/outages/:id` | 🔒 ADMIN | Soft delete. An ONGOING outage can't be deleted |

```jsonc
// POST /outages -> 201
{ "success": true, "message": "Outage created successfully. 25 customer(s) notified.",
  "data": { "id": "…", "title": "Feeder maintenance", "type": "SCHEDULED", "status": "SCHEDULED",
            "startTime": "2026-11-25T08:00:00.000Z", "expectedRestoreTime": "2026-11-25T11:00:00.000Z",
            "area": { "…": "full path" }, "notifiedCustomers": 25 } }
```

### Customer outage reports (5)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| POST | `/outage-reports` | 🔒 CUSTOMER | `{ title, description, address?, areaId? }`. If `areaId` is missing, the customer's own area is used. Only one open report per area. Admins are notified. Free of charge |
| GET | `/outage-reports/my-reports` | 🔒 CUSTOMER | `?page&limit&status&sortBy=createdAt\|updatedAt\|status&sortOrder` |
| GET | `/outage-reports` | 🔒 ADMIN | The same query, plus `searchTerm`, `areaId`, `zoneId` and `customerId` |
| GET | `/outage-reports/:id` | 🔒 ADMIN, or the CUSTOMER who owns it | Includes the area, customer, linked outage, assignment and repair records |
| PATCH | `/outage-reports/:id/status` | 🔒 ADMIN | `{ status: "UNDER_REVIEW"\|"REJECTED", adminNote?, outageId? }`. `adminNote` is required when rejecting. `outageId` must be in the same area |

Report status flow: `PENDING → UNDER_REVIEW → ASSIGNED → IN_PROGRESS → RESOLVED`. The admin can also set `REJECTED` from PENDING or UNDER_REVIEW.

### Technician assignments (8)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| POST | `/assignments` | 🔒 ADMIN | `{ reportId, technicianId, note? }`. The report must be UNDER_REVIEW and the technician must be ACTIVE. One assignment per report |
| GET | `/assignments` | 🔒 ADMIN | `?page&limit&status&technicianId&searchTerm&sortBy=assignedAt\|completedAt\|status&sortOrder` |
| PATCH | `/assignments/:id/technician` | 🔒 ADMIN | `{ technicianId }`. Change the technician; only allowed while ASSIGNED or ACCEPTED |
| GET | `/assignments/:id` | 🔒 ADMIN, or the assigned TECHNICIAN | Includes the customer's phone, the area and repair records |
| PATCH | `/assignments/:id/status` | 🔒 assigned TECHNICIAN | `{ status: "ACCEPTED"\|"IN_PROGRESS" }`. Flow: `ASSIGNED → ACCEPTED → IN_PROGRESS` |
| POST | `/assignments/:id/repair-report` | 🔒 assigned TECHNICIAN | `{ workDescription, partsUsed?, restoredAt? }` |
| GET | `/technicians/my-jobs` | 🔒 TECHNICIAN | `?page&limit&status`. Active jobs, oldest first |
| GET | `/technicians/my-history` | 🔒 TECHNICIAN | `?page&limit`. Completed jobs, newest first |

A repair report completes everything in **one transaction**:
- the assignment becomes COMPLETED and a repair record is saved
- the report becomes RESOLVED and `restoredAt` is set
- the linked outage becomes RESOLVED, if no other report on it is still open
- notifications and an audit log are created

```jsonc
// POST /assignments/:id/repair-report -> 201
{ "success": true, "message": "Repair report submitted. Job completed and power restored.",
  "data": { "id": "…", "status": "COMPLETED", "completedAt": "…",
            "repairRecords": [ { "workDescription": "Replaced the cable joint", "restoredAt": "…" } ],
            "outageResolved": true } }
```

### Notifications (3)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| GET | `/notifications` | 🔒 any role | `?page&limit&unreadOnly=true\|false`, newest first |
| PATCH | `/notifications/:id/read` | 🔒 owner | none. Another user's notification returns `404` |
| PATCH | `/notifications/read-all` | 🔒 any role | none. Returns `{ updatedCount }` |

```jsonc
// GET /notifications?unreadOnly=true -> 200
{ "success": true, "message": "Notifications retrieved successfully",
  "meta": { "page": 1, "limit": 10, "total": 3, "totalPages": 1, "unreadCount": 3 },
  "data": [ { "id": "…", "title": "Scheduled outage in Uttara Sector 7", "message": "Power will be off …",
              "type": "SCHEDULED_OUTAGE", "isRead": false, "createdAt": "…" } ] }
```

### Bills (3)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| POST | `/bills` | 🔒 ADMIN | `{ customerId, billMonth: "2026-11", unitsConsumed, amount, dueDate }`. Amount is at least 10 BDT. One bill per customer per month |
| GET | `/bills/my-bills` | 🔒 CUSTOMER | `?page&limit&status=UNPAID\|PAID` |
| GET | `/bills` | 🔒 ADMIN | `?page&limit&status&customerId&billMonth&searchTerm` (customer name, email or meter number) |

### Payments, SSLCommerz (6)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| POST | `/payments/initiate` | 🔒 CUSTOMER (own UNPAID bill) | `{ billId }`. Returns `gatewayUrl`. A recent pending session is reused |
| POST | `/payments/success` | SSLCommerz (browser form POST) | Verifies with SSLCommerz, then **303 redirect** to `FRONTEND_URL/payment/success?tran_id=…` |
| POST | `/payments/fail` | SSLCommerz | Marks it FAILED, then 303 redirect to `/payment/cancel?reason=failed` |
| POST | `/payments/cancel` | SSLCommerz | Marks it CANCELLED, then 303 redirect to `/payment/cancel?reason=cancelled` |
| POST | `/payments/ipn` | SSLCommerz server | Same verification as success. Returns JSON |
| GET | `/payments/my-payments` | 🔒 CUSTOMER | `?page&limit&status&transactionId` |

```jsonc
// POST /payments/initiate -> 201
{ "success": true, "message": "Payment session created. Redirect the customer to gatewayUrl.",
  "data": { "paymentId": "…", "transactionId": "LS-1795256340499-E639A3", "amount": 550.5,
            "gatewayUrl": "https://sandbox.sslcommerz.com/EasyCheckOut/…", "reused": false } }
```

### Admin (6)

| Method | Path | Access | Body / Query |
|---|---|---|---|
| GET | `/admin/dashboard-stats` | 🔒 ADMIN | none |
| GET | `/admin/users` | 🔒 ADMIN | `?page&limit&role&status&areaId&searchTerm&sortBy=createdAt\|name\|email&sortOrder` |
| POST | `/admin/users/technicians` | 🔒 ADMIN | `{ name, email, password, phone?, address? }`. The admin gives the technician this first password |
| PATCH | `/admin/users/:id/role` | 🔒 ADMIN | `{ role }`. Not allowed for yourself, the last active admin, or a technician with unfinished jobs. The user must log in again |
| PATCH | `/admin/users/:id/block` | 🔒 ADMIN | `{ status: "BLOCKED"\|"ACTIVE" }`. Not allowed for yourself or the last active admin. Blocking ends the session |
| GET | `/admin/audit-logs` | 🔒 ADMIN | `?page&limit&sortOrder&action&entityType&entityId&userId&from&to` |

```jsonc
// GET /admin/dashboard-stats -> 200
{ "success": true, "message": "Dashboard statistics retrieved successfully",
  "data": {
    "users":       { "ADMIN": 1, "CUSTOMER": 120, "TECHNICIAN": 8, "total": 129, "blocked": 2 },
    "network":     { "zones": 3, "substations": 9, "feeders": 24, "areas": 60 },
    "outages":     { "SCHEDULED": 4, "ONGOING": 1, "RESOLVED": 30, "CANCELLED": 2, "upcomingScheduled": 4 },
    "reports":     { "PENDING": 3, "UNDER_REVIEW": 1, "ASSIGNED": 2, "IN_PROGRESS": 1, "RESOLVED": 40, "REJECTED": 5, "open": 7 },
    "assignments": { "ASSIGNED": 2, "ACCEPTED": 0, "IN_PROGRESS": 1, "COMPLETED": 40 },
    "payments":    { "successfulPayments": 95, "totalRevenue": 81250.5, "thisMonthPayments": 12,
                     "thisMonthRevenue": 9800, "unpaidBills": 25, "unpaidAmount": 18400 } } }
```

"This month" is calculated in **Asia/Dhaka time** (UTC+6), whatever timezone the server is in.

Audit log actions:
- Outages: `OUTAGE_CREATED`, `OUTAGE_UPDATED`, `OUTAGE_STATUS_CHANGED`, `OUTAGE_DELETED`
- Reports: `REPORT_CREATED`, `REPORT_STATUS_CHANGED`
- Technicians and jobs: `TECHNICIAN_ASSIGNED`, `TECHNICIAN_REASSIGNED`, `ASSIGNMENT_STATUS_CHANGED`, `REPAIR_COMPLETED`
- Bills and payments: `BILL_CREATED`, `PAYMENT_SUCCESS`, `PAYMENT_FAILED`, `PAYMENT_CANCELLED`, `PAYMENT_VALIDATION_FAILED`, `DUPLICATE_PAYMENT_NEEDS_REFUND`
- Users: `TECHNICIAN_CREATED`, `USER_ROLE_CHANGED`, `USER_BLOCKED`, `USER_UNBLOCKED`

## 11. Response and error format

Every JSON response has the same shape:

```jsonc
// success
{ "success": true, "message": "…", "meta": { … }, "data": { … } }   // meta only on list endpoints

// error
{ "success": false, "message": "Validation failed",
  "errors": [ { "path": "email", "message": "Invalid email address" },
              { "path": "password", "message": "Password must contain at least one number" } ] }
```

| Status | When |
|---|---|
| `400` | Validation error (`errors` lists every invalid field), invalid status change, broken JSON |
| `401` | No token, invalid or expired token, session ended (logout, password or role change) |
| `403` | Wrong role, blocked account, or someone else's job (technician) |
| `404` | Record not found, or not yours (customers) |
| `409` | Duplicate (email, code, bill month), item still in use, or two requests changing the same data at once |
| `429` | Rate limit reached |
| `502` | SSLCommerz could not create the payment session |
| `503` | Database transaction took too long and nothing was saved; try again |

In `production`, unexpected errors only say `"Something went wrong"` and never include a stack trace.

## 12. Pagination, filtering, sorting, search

| Query | Default | Rules |
|---|---|---|
| `page` | `1` | at least 1 |
| `limit` | `10` | 1 to 100 |
| `sortBy` | depends on the endpoint | Only the listed fields are allowed |
| `sortOrder` | `desc` | `asc` or `desc` |
| `searchTerm` / `q` | none | Case-insensitive "contains" search |
| Filters | none | For example `status`, `type`, `areaId` or `zoneId` (see each endpoint) |
| Dates | none | ISO format, for example `from=2026-11-01T00:00:00+06:00` |

```
GET /api/v1/outages?zoneId=<uuid>&status=SCHEDULED&sortBy=startTime&sortOrder=asc&page=2&limit=5
GET /api/v1/outages/search?q=Uttara
```

Unknown values (for example `status=DONE` or `limit=500`) return `400`. All queries go through Prisma, so search text is never run as SQL.

## 13. SSLCommerz sandbox: setup and testing

Customers pay **electricity bills** created by an admin. Reporting an outage is always free.

```
Customer → POST /payments/initiate {billId} → gatewayUrl (SSLCommerz payment page)
Customer pays on SSLCommerz
SSLCommerz → (browser) POST /payments/success → we call the SSLCommerz VALIDATION API with val_id
           → SUCCESS only if status is VALID/VALIDATED and tran_id, amount and currency all match
           → bill PAID, notification, audit log → 303 redirect to FRONTEND_URL/payment/success
SSLCommerz → (server) POST /payments/ipn       → same validation; nothing happens twice
```

**Safety rules**
- The browser's data is **never trusted**: a forged `val_id` leaves the payment PENDING and the bill UNPAID.
- **No double processing**: the update only runs while the payment is not SUCCESS yet, so the success callback and the IPN can both arrive safely.
- A second "Pay" click within 30 minutes reuses the same session. A PAID bill can't be paid again (`409`).
- Fail and cancel callbacks only change a PENDING payment; they never undo a SUCCESS.

**Testing steps**
1. Create a sandbox store at https://developer.sslcommerz.com/registration/. Put the store ID and password in `.env` and keep `SSLCOMMERZ_IS_LIVE=false`.
2. As admin: `POST /api/v1/bills` with `{ customerId, billMonth, unitsConsumed, amount, dueDate }`.
3. As that customer: `POST /api/v1/payments/initiate` with `{ billId }`, then open `data.gatewayUrl` in a browser.
4. Pay with the sandbox card **4111 1111 1111 1111**, any future expiry date, CVV **111** (OTP **111111** if asked), or a sandbox mobile banking option.
5. The browser comes back through `/payments/success` and ends on `FRONTEND_URL/payment/success?tran_id=…`. If the frontend isn't running, that last page won't load, but the payment is already processed.
6. Check `GET /payments/my-payments` (status `SUCCESS`) and `GET /bills/my-bills` (status `PAID`).

Or run the guided script in section 14 (`npm run test:payment`).

**IPN** is sent by SSLCommerz's server, so it can't reach `localhost`. After deploying, set `SSLCOMMERZ_IPN_URL=https://<your-backend>/api/v1/payments/ipn`.

## 14. Running the tests

```bash
npm run typecheck            # TypeScript check
npm run lint:check           # Biome lint
npx prisma validate          # schema check

npm run test:e2e             # full end-to-end test (about 110 checks, takes a few minutes)
```

`test:e2e`:
- starts **its own** server on port 5055, so your `npm run dev` on port 5000 isn't touched
- uses the real database: every test record gets a unique tag and is deleted at the end
- never logs in as your real admin; a temporary test admin is created instead
- covers all 5 business workflows; authentication and RBAC on every protected endpoint; ownership (IDOR); validation and SQL-injection attempts; secret leaks; Helmet and CORS; soft delete; races; last-admin protection; the Dhaka month calculation; and rate limiting (on a second, production-mode server on port 5056)

**Real SSLCommerz payment** (needs a person to pay on the sandbox page):

```bash
npm run dev                          # keep it running (SSLCommerz sends the browser back to BACKEND_URL)
npm run test:payment -- start        # prints a payment link
#   open the link and pay with the sandbox test card
npm run test:payment -- verify       # checks SUCCESS, PAID, notification, audit log and duplicate protection, then cleans up
npm run test:payment -- cleanup      # only removes the test data (if you didn't pay)
```

## 15. Deployment (Vercel)

1. Push the code to GitHub. `.env` is **not** pushed.
2. Import the repository in Vercel. `vercel.json` routes every request to `dist/server.js`. Build command: `npm run build`.
3. Add every variable from section 5 in **Vercel → Project → Settings → Environment Variables**, with these values:
   - `NODE_ENV=production`
   - `BACKEND_URL` = your Vercel API URL
   - `FRONTEND_URL` = your deployed frontend URL
   - `SSLCOMMERZ_IPN_URL=https://<api-domain>/api/v1/payments/ipn`
   - **Use new JWT secrets and a new admin password** for production.
4. Run migrations against the production database from your computer, once per schema change: `npm run prisma:deploy` with the production `DIRECT_URL`.
5. After deploying, test `GET /` and one sandbox payment, including the IPN.

Notes for serverless hosting:
- **Rate limits** are counted in memory for each server instance, so with several instances the limit is per instance.
- The admin seed runs on every cold start. That's harmless, because it does nothing when the admin already exists.

## 16. Project structure

```
prisma/
  schema/                one .prisma file per area (enums, user, network, outage, assignment, notification, payment, auditLog)
  migrations/            SQL migrations
src/
  server.ts              checks JWT secrets, connects DB, seeds admin, starts server
  app.ts                 helmet, cors, body parsers, rate limit, routes, 404 and error handler
  app/
    config/              all .env values in one place
    lib/                 prisma.ts (DB client), sslcommerz.ts (payment API)
    middleware/          checkAuth (auth(...roles)), validateRequest (zod), rateLimiter, globalErrorHandler, notFound
    module/<name>/       <name>.route / .controller / .service / .validation / .interface
                         auth, user, zone, substation, feeder, area, outage, outageReport,
                         assignment, notification, bill, payment, admin
    scripts/             seedAdmin.ts
    utils/               AppError, catchAsync, sendResponse, jwt, auditLog, notification,
                         pagination, commonValidation, safeUser, seed
tests/
  e2e.ts                 automated end-to-end test
  payment-sandbox.ts     guided real SSLCommerz payment test
```

Each module follows the same pattern: **route** (URL, auth and validation) → **controller** (reads the request, sends the response) → **service** (business rules and the database).

### Database diagram

```
DistributionZone 1──* Substation 1──* Feeder 1──* Area
                                                   │ 1
             ┌───────────────────────┬─────────────┼──────────────────┐
             *                       *             *                  *
          Outage ◄──0..1── OutageReport        User (customer.areaId)
     (createdBy: Admin)    (customer: User)
                                  │ 1
                                  │ 0..1
                       TechnicianAssignment 1──* RepairRecord
                     (technician, assignedBy: User)

User 1──* Notification     User 1──* Bill 1──* Payment     User 0..1──* AuditLog
```

- `email`, `meterNumber`, every network `code`, `transactionId` and the pair `(customerId, billMonth)` are unique.
- Soft delete (`deletedAt`) is used for users, network items and outages.
- When a customer becomes a technician or admin, `areaId` and `meterNumber` are kept, so nothing is lost if the role is changed back. Area notifications only go to `CUSTOMER`s, so the old area has no effect. An area that still has such users can't be deleted.

## 17. All scripts

| Script | What it does |
|---|---|
| `npm run dev` | Development server with auto-restart |
| `npm run build` / `npm start` | `prisma generate` + bundle with tsup / run `dist/server.js` |
| `npm run seed` | Create the first admin from `.env` |
| `npm run prisma:deploy` | Apply migrations |
| `npm run prisma:migrate` | Create a new migration (interactive) |
| `npm run prisma:studio` | Browse the database |
| `npm run typecheck` | TypeScript check |
| `npm run test:e2e` | End-to-end tests |
| `npm run test:payment -- start\|verify\|cleanup` | Real sandbox payment test |
| `npm run lint:check` / `lint:fix` / `format:check` / `format:fix` | Biome |

The API checklist with the implementation and test status of all 64 endpoints is in [API_CHECKLIST.md](./API_CHECKLIST.md).
