# API Checklist

All endpoints are prefixed with `/api/v1`.
Status: ⬜ not started · 🟡 implemented · ✅ implemented and tested

| # | Method | Endpoint | Purpose | Role | Implemented | Tested |
|---|---|---|---|---|:-:|:-:|
| 1 | POST | `/auth/register` | Customer registration | Public | ⬜ | ⬜ |
| 2 | POST | `/auth/login` | Login, returns access and refresh tokens | Public | ⬜ | ⬜ |
| 3 | POST | `/auth/refresh-token` | New access token (refresh token is rotated) | Public (refresh token) | ⬜ | ⬜ |
| 4 | POST | `/auth/logout` | Invalidate refresh token | Logged in | ⬜ | ⬜ |
| 5 | GET | `/users/me` | Own profile | Any role | ⬜ | ⬜ |
| 6 | PATCH | `/users/me` | Update own profile | Any role | ⬜ | ⬜ |
| 7 | PATCH | `/users/me/change-password` | Change password | Any role | ⬜ | ⬜ |
| 8 | POST | `/zones` | Create zone | Admin | ⬜ | ⬜ |
| 9 | GET | `/zones` | List zones | Public | ⬜ | ⬜ |
| 10 | GET | `/zones/:id` | Zone details | Public | ⬜ | ⬜ |
| 11 | PATCH | `/zones/:id` | Update zone | Admin | ⬜ | ⬜ |
| 12 | DELETE | `/zones/:id` | Soft delete zone | Admin | ⬜ | ⬜ |
| 13 | POST | `/substations` | Create substation | Admin | ⬜ | ⬜ |
| 14 | GET | `/substations` | List (filter by zoneId) | Public | ⬜ | ⬜ |
| 15 | GET | `/substations/:id` | Substation details | Public | ⬜ | ⬜ |
| 16 | PATCH | `/substations/:id` | Update substation | Admin | ⬜ | ⬜ |
| 17 | DELETE | `/substations/:id` | Soft delete substation | Admin | ⬜ | ⬜ |
| 18 | POST | `/feeders` | Create feeder | Admin | ⬜ | ⬜ |
| 19 | GET | `/feeders` | List (filter by substationId) | Public | ⬜ | ⬜ |
| 20 | GET | `/feeders/:id` | Feeder details | Public | ⬜ | ⬜ |
| 21 | PATCH | `/feeders/:id` | Update feeder | Admin | ⬜ | ⬜ |
| 22 | DELETE | `/feeders/:id` | Soft delete feeder | Admin | ⬜ | ⬜ |
| 23 | POST | `/areas` | Create area | Admin | ⬜ | ⬜ |
| 24 | GET | `/areas` | List (filter by feederId) | Public | ⬜ | ⬜ |
| 25 | GET | `/areas/:id` | Area details | Public | ⬜ | ⬜ |
| 26 | PATCH | `/areas/:id` | Update area | Admin | ⬜ | ⬜ |
| 27 | DELETE | `/areas/:id` | Soft delete area | Admin | ⬜ | ⬜ |
| 28 | POST | `/outages` | Create scheduled outage, notify area customers | Admin | ⬜ | ⬜ |
| 29 | GET | `/outages` | Pagination, filter, sort | Public | ⬜ | ⬜ |
| 30 | GET | `/outages/search?q=` | Search by area, feeder, zone or reason | Public | ⬜ | ⬜ |
| 31 | GET | `/outages/:id` | Outage details with full hierarchy | Public | ⬜ | ⬜ |
| 32 | PATCH | `/outages/:id` | Update or change status | Admin | ⬜ | ⬜ |
| 33 | DELETE | `/outages/:id` | Soft delete outage | Admin | ⬜ | ⬜ |
| 34 | POST | `/outage-reports` | Submit unexpected outage report | Customer | ⬜ | ⬜ |
| 35 | GET | `/outage-reports/my-reports` | Own reports | Customer | ⬜ | ⬜ |
| 36 | GET | `/outage-reports` | All reports | Admin | ⬜ | ⬜ |
| 37 | GET | `/outage-reports/:id` | Report details | Admin / Customer (own) | ⬜ | ⬜ |
| 38 | PATCH | `/outage-reports/:id/status` | Review (UNDER_REVIEW / REJECTED) | Admin | ⬜ | ⬜ |
| 39 | POST | `/assignments` | Assign technician | Admin | ⬜ | ⬜ |
| 40 | GET | `/assignments` | Monitor assignments | Admin | ⬜ | ⬜ |
| 41 | GET | `/assignments/:id` | Assignment details | Admin / Technician (own) | ⬜ | ⬜ |
| 42 | PATCH | `/assignments/:id/status` | ACCEPTED or IN_PROGRESS | Technician (own) | ⬜ | ⬜ |
| 43 | POST | `/assignments/:id/repair-report` | Complete job and restore power | Technician (own) | ⬜ | ⬜ |
| 44 | GET | `/technicians/my-jobs` | Active jobs | Technician | ⬜ | ⬜ |
| 45 | GET | `/technicians/my-history` | Completed jobs | Technician | ⬜ | ⬜ |
| 46 | GET | `/notifications` | Own notifications | Any role | ⬜ | ⬜ |
| 47 | PATCH | `/notifications/:id/read` | Mark one as read | Any role | ⬜ | ⬜ |
| 48 | PATCH | `/notifications/read-all` | Mark all as read | Any role | ⬜ | ⬜ |
| 49 | POST | `/bills` | Create bill | Admin | ⬜ | ⬜ |
| 50 | GET | `/bills/my-bills` | Own bills | Customer | ⬜ | ⬜ |
| 51 | GET | `/bills` | All bills | Admin | ⬜ | ⬜ |
| 52 | POST | `/payments/initiate` | Start SSLCommerz session | Customer | ⬜ | ⬜ |
| 53 | POST | `/payments/success` | SSLCommerz success callback (verify, then redirect) | SSLCommerz | ⬜ | ⬜ |
| 54 | POST | `/payments/fail` | Fail callback | SSLCommerz | ⬜ | ⬜ |
| 55 | POST | `/payments/cancel` | Cancel callback | SSLCommerz | ⬜ | ⬜ |
| 56 | POST | `/payments/ipn` | IPN (server-to-server) | SSLCommerz | ⬜ | ⬜ |
| 57 | GET | `/payments/my-payments` | Own payment history | Customer | ⬜ | ⬜ |
| 58 | GET | `/admin/dashboard-stats` | Dashboard statistics | Admin | ⬜ | ⬜ |
| 59 | GET | `/admin/users` | List users | Admin | ⬜ | ⬜ |
| 60 | POST | `/admin/users` | Create technician or admin | Admin | ⬜ | ⬜ |
| 61 | PATCH | `/admin/users/:id/role` | Change role | Admin | ⬜ | ⬜ |
| 62 | PATCH | `/admin/users/:id/status` | Block or unblock user | Admin | ⬜ | ⬜ |
| 63 | GET | `/admin/audit-logs` | Audit logs | Admin | ⬜ | ⬜ |

## Phase progress

| Phase | Work | Status |
|---|---|:-:|
| 1 | Setup, security middleware, error format | ✅ |
| 2 | Prisma schema (13 models), migration, admin seed | ✅ |
| 3 | Auth and RBAC | ⬜ |
| 4 | Zone, Substation, Feeder, Area | ⬜ |
| 5 | Outages | ⬜ |
| 6 | Outage reports | ⬜ |
| 7 | Assignments and repair | ⬜ |
| 8 | Notifications | ⬜ |
| 9 | Bills and SSLCommerz | ⬜ |
| 10 | Admin APIs and audit logs | ⬜ |
| 11 | Final testing and docs | ⬜ |
