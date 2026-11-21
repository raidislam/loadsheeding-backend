/**
 * End-to-end test suite.
 *
 *   npm run test:e2e
 *
 * - Starts its OWN server on port 5055 (your `npm run dev` on 5000 is not touched),
 *   plus a short-lived production-mode server on port 5056 for the rate-limit test.
 * - Uses the real database. Every test record has a unique tag and is deleted at the end.
 * - Never logs in as your real admin. A temporary test admin is created instead.
 * - SSLCommerz: a REAL sandbox session is created, but a successful payment needs a
 *   human in the browser -> see tests/payment-sandbox.ts (npm run test:payment).
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import { type ChildProcess, spawn } from "child_process";
import { prisma } from "../src/app/lib/prisma";
import { AdminService, getDhakaMonthStart } from "../src/app/module/admin/admin.service";

// ------------------------------------------------------------------ helpers
const PORT = 5055;
const BASE = `http://localhost:${PORT}/api/v1`;
const TAG = Date.now().toString(36).toUpperCase(); // e.g. "MI4ZK2QX"
const FAKE_ID = "00000000-0000-4000-8000-000000000000";
const startedAt = new Date();

let passed = 0;
let failed = 0;
let requestCount = 0;
const failures: string[] = [];
const leaks: string[] = []; // responses that contained a secret field

const section = (title: string) => console.log(`\n=== ${title} ===`);

const check = (name: string, ok: boolean, info: unknown = "") => {
	if (ok) passed++;
	else {
		failed++;
		failures.push(name);
	}
	const extra = info === "" ? "" : ` | ${typeof info === "string" ? info : JSON.stringify(info)}`;
	console.log(`${ok ? "PASS" : "FAIL"} | ${name}${extra}`);
};

type TCall = { status: number; json: any; headers: Headers; location: string };

// JSON request to the API. Every response is scanned for secret fields.
const api = async (method: string, path: string, opts: { body?: unknown; token?: string; base?: string } = {}): Promise<TCall> => {
	requestCount++;
	const res = await fetch((opts.base ?? BASE) + path, {
		method,
		redirect: "manual",
		headers: {
			"Content-Type": "application/json",
			...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
		},
		// GET requests can't have a body
		body: opts.body === undefined || method === "GET" ? undefined : JSON.stringify(opts.body),
	});
	const text = await res.text();
	if (/"(password|refreshTokenHash|store_passwd)"\s*:/.test(text)) leaks.push(`${method} ${path}`);
	let json: any = null;
	try {
		json = JSON.parse(text);
	} catch {
		json = null;
	}
	return { status: res.status, json, headers: res.headers, location: res.headers.get("location") ?? "" };
};

// Simulates SSLCommerz posting an HTML form to our callback URLs
const postForm = async (path: string, form: Record<string, string>) => {
	requestCount++;
	const res = await fetch(BASE + path, { method: "POST", body: new URLSearchParams(form), redirect: "manual" });
	const text = await res.text();
	return { status: res.status, location: res.headers.get("location") ?? "", text };
};

const login = async (email: string, password: string) => {
	const r = await api("POST", "/auth/login", { body: { email, password } });
	return r.json?.data?.accessToken as string;
};

const hoursFromNow = (h: number) => new Date(Date.now() + h * 3600_000).toISOString();

// Starts `node --import tsx src/server.ts` with extra env values and waits for it
const startServer = async (port: number, env: Record<string, string>) => {
	const child = spawn(process.execPath, ["--import", "tsx", "src/server.ts"], {
		env: { ...process.env, PORT: String(port), ...env },
		stdio: "ignore",
	});
	for (let i = 0; i < 60; i++) {
		try {
			const res = await fetch(`http://localhost:${port}/`);
			if (res.ok) return child;
		} catch {
			// not ready yet
		}
		await new Promise((resolve) => setTimeout(resolve, 1000));
	}
	child.kill();
	throw new Error(`Server on port ${port} did not start`);
};

// ------------------------------------------------------------------ test data ids
const ids = {
	users: [] as string[],
	zone: "",
	substation: "",
	feeder: "",
	areaA: "",
	areaB: "",
	areaC: "",
};

// ------------------------------------------------------------------ main
const main = async () => {
	let server: ChildProcess | null = null;
	const realAdmins = await prisma.user.findMany({ where: { role: "ADMIN", deletedAt: null } });
	const realAdminSnapshot = realAdmins.map((a) => ({ id: a.id, role: a.role, status: a.status }));

	try {
		console.log(`Test tag: ${TAG}`);
		server = await startServer(PORT, { RATE_LIMIT_MAX: "5000", AUTH_RATE_LIMIT_MAX: "200" });
		console.log(`Test server started on port ${PORT}`);

		// ---------------- setup: a temporary admin (your real admin is never used)
		const adminEmail = `e2e.${TAG.toLowerCase()}.admin@test.com`;
		const testAdmin = await prisma.user.create({
			data: { name: `E2E Admin ${TAG}`, email: adminEmail, password: await bcrypt.hash("Admin1234", 10), role: "ADMIN" },
		});
		ids.users.push(testAdmin.id);
		let admin = await login(adminEmail, "Admin1234");

		// =================================================================
		section("WORKFLOW 1: Electricity network");
		let r = await api("POST", "/zones", { token: admin, body: { name: `E2E Dhaka North ${TAG}`, code: `E2E-ZN-${TAG}` } });
		check("Admin creates Zone -> 201", r.status === 201, r.json?.message);
		ids.zone = r.json.data.id;
		r = await api("POST", "/substations", { token: admin, body: { name: `E2E Uttara Grid ${TAG}`, code: `E2E-SS-${TAG}`, zoneId: ids.zone, capacityMW: 120 } });
		check("Admin creates Substation -> 201", r.status === 201);
		ids.substation = r.json.data.id;
		r = await api("POST", "/feeders", { token: admin, body: { name: `E2E Feeder 11kV ${TAG}`, code: `E2E-FD-${TAG}`, substationId: ids.substation, voltageKV: 11 } });
		check("Admin creates Feeder -> 201", r.status === 201);
		ids.feeder = r.json.data.id;
		r = await api("POST", "/areas", { token: admin, body: { name: `E2E Uttara Sector 7 ${TAG}`, code: `E2E-A-${TAG}`, feederId: ids.feeder } });
		check("Admin creates Area A -> 201", r.status === 201);
		ids.areaA = r.json.data.id;
		r = await api("POST", "/areas", { token: admin, body: { name: `E2E Uttara Sector 9 ${TAG}`, code: `E2E-B-${TAG}`, feederId: ids.feeder } });
		ids.areaB = r.json.data.id;
		r = await api("GET", `/areas/${ids.areaA}`);
		check("Area shows full path area -> feeder -> substation -> zone", r.json?.data?.feeder?.substation?.zone?.id === ids.zone);
		r = await api("GET", `/zones/${ids.zone}`);
		check("Zone lists its substation", r.json?.data?.substations?.length === 1);
		r = await api("GET", `/feeders/${ids.feeder}`);
		check("Feeder lists its 2 areas", r.json?.data?.areas?.length === 2);
		r = await api("GET", `/areas?zoneId=${ids.zone}`);
		check("Areas filtered by zone -> 2", r.json?.meta?.total === 2);
		r = await api("DELETE", `/zones/${ids.zone}`, { token: admin });
		check("Zone with children can't be deleted -> 409", r.status === 409, r.json?.message);

		// ---------------- customers register (public)
		section("AUTH: register, login, refresh, logout");
		const reg = async (name: string, areaId: string, phone: string) => {
			const res = await api("POST", "/auth/register", {
				body: { name: `E2E ${name} ${TAG}`, email: `e2e.${TAG.toLowerCase()}.${name.toLowerCase()}@test.com`, password: "Pass1234", phone, areaId, role: "ADMIN" },
			});
			if (res.json?.data?.user?.id) ids.users.push(res.json.data.user.id);
			return res;
		};
		r = await reg("Rahim", ids.areaA, "01711000001");
		check("Customer registers -> 201, role forced to CUSTOMER", r.status === 201 && r.json.data.user.role === "CUSTOMER", r.json?.data?.user?.role);
		const c1 = r.json.data.user;
		const c2 = (await reg("Karim", ids.areaB, "01711000002")).json.data.user;
		const c3 = (await reg("Salma", ids.areaA, "01711000003")).json.data.user;
		let k1 = await login(c1.email, "Pass1234");
		const k2 = await login(c2.email, "Pass1234");
		let k3 = await login(c3.email, "Pass1234");
		check("Customers can log in", !!k1 && !!k2 && !!k3);
		r = await api("POST", "/auth/login", { body: { email: c1.email, password: "Wrong1234" } });
		check("Wrong password -> 401", r.status === 401);
		const loginRes = await api("POST", "/auth/login", { body: { email: c1.email, password: "Pass1234" } });
		const oldRefresh = loginRes.json.data.refreshToken;
		r = await api("POST", "/auth/refresh-token", { body: { refreshToken: oldRefresh } });
		check("Refresh token -> new pair", r.status === 200 && !!r.json.data.accessToken);
		k1 = r.json.data.accessToken;
		r = await api("POST", "/auth/refresh-token", { body: { refreshToken: oldRefresh } });
		check("Old refresh token rejected (rotation) -> 401", r.status === 401);
		r = await api("POST", "/auth/logout", { token: k1 });
		check("Logout -> 200", r.status === 200);
		r = await api("GET", "/users/me", { token: k1 });
		check("Access token after logout -> 401", r.status === 401);
		k1 = await login(c1.email, "Pass1234");
		r = await api("GET", "/users/me", { token: k1 });
		check("GET /users/me shows own area hierarchy", r.json?.data?.area?.feeder?.substation?.zone?.id === ids.zone);

		// =================================================================
		section("WORKFLOW 2: Scheduled outage");
		r = await api("POST", "/outages", {
			token: admin,
			body: { title: `E2E Maintenance ${TAG}`, areaId: ids.areaA, startTime: hoursFromNow(2), expectedRestoreTime: hoursFromNow(4), reason: "Transformer maintenance" },
		});
		check("Admin creates scheduled outage -> 201", r.status === 201 && r.json.data.status === "SCHEDULED");
		check("Both customers in Area A notified (2)", r.json?.data?.notifiedCustomers === 2, r.json?.data?.notifiedCustomers);
		const scheduled = r.json.data;
		r = await api("GET", `/outages?areaId=${ids.areaA}`);
		check("Public (no login) sees the outage", r.status === 200 && r.json.data.some((o: any) => o.id === scheduled.id));
		r = await api("GET", `/outages/search?q=${encodeURIComponent(`Uttara Sector 7 ${TAG}`)}`);
		check("Public search by area name finds it", r.json?.data?.some((o: any) => o.id === scheduled.id));
		r = await api("GET", "/notifications?unreadOnly=true", { token: k1 });
		check("Customer got SCHEDULED_OUTAGE notification", r.json?.data?.some((n: any) => n.type === "SCHEDULED_OUTAGE"));
		r = await api("GET", "/notifications", { token: k2 });
		check("Customer in Area B did NOT get it", !r.json?.data?.some((n: any) => n.type === "SCHEDULED_OUTAGE"));
		r = await api("PATCH", `/outages/${scheduled.id}`, { token: admin, body: { status: "RESOLVED" } });
		check("SCHEDULED -> RESOLVED (skip) -> 400", r.status === 400, r.json?.message);
		r = await api("PATCH", `/outages/${scheduled.id}`, { token: admin, body: { status: "ONGOING" } });
		check("SCHEDULED -> ONGOING -> 200", r.status === 200);
		r = await api("PATCH", `/outages/${scheduled.id}`, { token: admin, body: { status: "RESOLVED" } });
		check("ONGOING -> RESOLVED, actualRestoreTime recorded", r.status === 200 && !!r.json.data.actualRestoreTime);
		r = await api("GET", `/outages/${scheduled.id}`);
		check("Public sees RESOLVED", r.json?.data?.status === "RESOLVED");
		r = await api("GET", "/notifications", { token: k1 });
		check("Customer got POWER_RESTORED notification", r.json?.data?.some((n: any) => n.type === "POWER_RESTORED"));
		r = await api("GET", `/admin/audit-logs?entityId=${scheduled.id}`, { token: admin });
		check("Audit: OUTAGE_CREATED + 2x OUTAGE_STATUS_CHANGED", r.json?.meta?.total === 3, r.json?.data?.map((l: any) => l.action));

		// =================================================================
		section("WORKFLOW 3: Unexpected outage -> report -> technician -> repair");
		r = await api("POST", "/outages", {
			token: admin,
			body: { title: `E2E Cable fault ${TAG}`, type: "UNEXPECTED", areaId: ids.areaB, startTime: hoursFromNow(-0.5), expectedRestoreTime: hoursFromNow(3), reason: "Underground cable fault" },
		});
		check("Admin records unexpected outage -> ONGOING", r.status === 201 && r.json.data.status === "ONGOING");
		const faultOutage = r.json.data;
		r = await api("POST", "/outage-reports", { token: k2, body: { title: "No power since evening", description: "The whole road has had no electricity for 2 hours.", address: "House 7, Road 3" } });
		check("Customer submits report (own area) -> 201 PENDING", r.status === 201 && r.json.data.status === "PENDING" && r.json.data.area.id === ids.areaB);
		const report = r.json.data;
		r = await api("GET", "/notifications", { token: admin });
		check("Admin notified about new report", r.json?.data?.some((n: any) => n.title === "New outage report"));
		r = await api("GET", `/outage-reports/${report.id}`, { token: k3 });
		check("IDOR: other customer can't view report -> 404", r.status === 404);

		r = await api("POST", "/admin/users/technicians", { token: admin, body: { name: `E2E Tech One ${TAG}`, email: `e2e.${TAG.toLowerCase()}.tech1@test.com`, password: "Tech1234", phone: "01811000001" } });
		check("Admin creates technician 1 -> 201", r.status === 201 && r.json.data.role === "TECHNICIAN");
		const tech1 = r.json.data;
		ids.users.push(tech1.id);
		r = await api("POST", "/admin/users/technicians", { token: admin, body: { name: `E2E Tech Two ${TAG}`, email: `e2e.${TAG.toLowerCase()}.tech2@test.com`, password: "Tech1234" } });
		const tech2 = r.json.data;
		ids.users.push(tech2.id);
		const t1 = await login(tech1.email, "Tech1234");
		let t2 = await login(tech2.email, "Tech1234");

		r = await api("POST", "/assignments", { token: admin, body: { reportId: report.id, technicianId: tech1.id } });
		check("Assign before review -> 400", r.status === 400, r.json?.message);
		r = await api("PATCH", `/outage-reports/${report.id}/status`, { token: admin, body: { status: "UNDER_REVIEW", outageId: faultOutage.id, adminNote: "Linked to cable fault" } });
		check("Admin reviews report + links outage -> UNDER_REVIEW", r.status === 200 && r.json.data.status === "UNDER_REVIEW");
		const race = await Promise.all([
			api("POST", "/assignments", { token: admin, body: { reportId: report.id, technicianId: tech1.id } }),
			api("POST", "/assignments", { token: admin, body: { reportId: report.id, technicianId: tech1.id } }),
		]);
		check("Race: 2 assignments at once -> one 201, one 409", race.map((x) => x.status).sort().join(",") === "201,409", race.map((x) => x.status));
		const job = race.find((x) => x.status === 201)?.json.data;
		r = await api("GET", `/assignments/${job.id}`, { token: t2 });
		check("IDOR: other technician can't view job -> 403", r.status === 403);
		r = await api("PATCH", `/assignments/${job.id}/status`, { token: t2, body: { status: "ACCEPTED" } });
		check("Other technician can't update job -> 403", r.status === 403);
		r = await api("GET", "/technicians/my-jobs", { token: t1 });
		check("Technician sees job in my-jobs", r.json?.data?.some((j: any) => j.id === job.id));
		r = await api("PATCH", `/assignments/${job.id}/status`, { token: t1, body: { status: "ACCEPTED" } });
		check("Technician accepts -> ACCEPTED", r.status === 200 && r.json.data.status === "ACCEPTED");
		r = await api("PATCH", `/assignments/${job.id}/status`, { token: t1, body: { status: "IN_PROGRESS" } });
		check("Technician starts -> IN_PROGRESS", r.status === 200 && r.json.data.status === "IN_PROGRESS");
		r = await api("GET", `/outage-reports/${report.id}`, { token: k2 });
		check("Customer tracks report -> IN_PROGRESS", r.json?.data?.status === "IN_PROGRESS");
		r = await api("POST", `/assignments/${job.id}/repair-report`, { token: t1, body: { workDescription: "Replaced the damaged underground cable joint.", partsUsed: "Cable joint kit" } });
		check("Repair report -> 201 COMPLETED, outage resolved", r.status === 201 && r.json.data.status === "COMPLETED" && r.json.data.outageResolved === true, r.json?.message);
		r = await api("POST", `/assignments/${job.id}/repair-report`, { token: t1, body: { workDescription: "Trying to submit the same repair twice." } });
		check("Duplicate repair report -> 400", r.status === 400);
		r = await api("GET", `/outage-reports/${report.id}`, { token: k2 });
		check("Report RESOLVED with restoredAt + repair record", r.json?.data?.status === "RESOLVED" && !!r.json.data.restoredAt && r.json.data.assignment.repairRecords.length === 1);
		r = await api("GET", `/outages/${faultOutage.id}`);
		check("Linked outage RESOLVED with actualRestoreTime", r.json?.data?.status === "RESOLVED" && !!r.json.data.actualRestoreTime);
		r = await api("GET", "/notifications", { token: k2 });
		const titles: string[] = r.json?.data?.map((n: any) => n.title) ?? [];
		check(
			"Customer notified: assigned, accepted, started, restored",
			["Technician assigned", "Technician accepted your report", "Repair work started", "Power restored"].every((t) => titles.includes(t)),
			titles,
		);
		r = await api("GET", "/notifications", { token: t1 });
		check("Technician got JOB_ASSIGNED", r.json?.data?.some((n: any) => n.type === "JOB_ASSIGNED"));
		r = await api("GET", "/technicians/my-history", { token: t1 });
		check("Technician history shows completed job", r.json?.data?.some((j: any) => j.id === job.id));
		r = await api("GET", `/admin/audit-logs?entityId=${job.id}`, { token: admin });
		const jobActions = r.json?.data?.map((l: any) => l.action) ?? [];
		check("Audit: TECHNICIAN_ASSIGNED, 2x status change, REPAIR_COMPLETED", ["TECHNICIAN_ASSIGNED", "ASSIGNMENT_STATUS_CHANGED", "REPAIR_COMPLETED"].every((a) => jobActions.includes(a)) && jobActions.length === 4, jobActions);

		// =================================================================
		section("WORKFLOW 4: Bill + SSLCommerz (automatic part)");
		r = await api("POST", "/bills", { token: admin, body: { customerId: c1.id, billMonth: "2026-11", unitsConsumed: 150, amount: 725.5, dueDate: "2026-12-15" } });
		check("Admin creates bill -> 201 UNPAID", r.status === 201 && r.json.data.status === "UNPAID");
		const bill = r.json.data;
		r = await api("GET", "/notifications", { token: k1 });
		check("Customer notified about the bill", r.json?.data?.some((n: any) => n.type === "PAYMENT"));
		r = await api("GET", "/bills/my-bills", { token: k1 });
		check("Customer sees own bill", r.json?.data?.some((b: any) => b.id === bill.id));
		r = await api("POST", "/payments/initiate", { token: k3, body: { billId: bill.id } });
		check("IDOR: other customer can't pay this bill -> 404", r.status === 404);
		r = await api("POST", "/payments/initiate", { token: k1, body: { billId: bill.id } });
		check("Initiate -> REAL SSLCommerz sandbox session", r.status === 201 && String(r.json?.data?.gatewayUrl).startsWith("https://sandbox.sslcommerz.com/"), r.json?.data?.gatewayUrl ?? r.json?.message);
		const payment = r.json?.data;
		r = await api("POST", "/payments/initiate", { token: k1, body: { billId: bill.id } });
		check("Initiate again -> same session reused (no 2nd payment)", r.json?.data?.reused === true && r.json.data.transactionId === payment?.transactionId);
		let cb = await postForm("/payments/success", { tran_id: payment?.transactionId, val_id: "FORGED123", status: "VALID", amount: "725.50" });
		check("Forged success callback -> redirect to cancel page", cb.status === 303 && cb.location.includes("reason=validation_failed"), cb.location);
		cb = await postForm("/payments/ipn", { tran_id: payment?.transactionId, val_id: "FORGED456", status: "VALID" });
		check("Forged IPN -> ok:false", JSON.parse(cb.text)?.data?.ok === false);
		r = await api("GET", "/bills/my-bills", { token: k1 });
		check("Bill still UNPAID after forged callbacks", r.json?.data?.find((b: any) => b.id === bill.id)?.status === "UNPAID");
		cb = await postForm("/payments/cancel", { tran_id: payment?.transactionId, status: "CANCELLED" });
		check("Cancel callback -> CANCELLED + redirect", cb.location.includes("reason=cancelled"));
		r = await api("GET", "/payments/my-payments", { token: k1 });
		check("Payment history shows CANCELLED attempt", r.json?.data?.[0]?.status === "CANCELLED");
		r = await api("GET", "/payments/my-payments", { token: k3 });
		check("Other customer sees no payments", r.json?.meta?.total === 0);

		// =================================================================
		section("WORKFLOW 5: Admin management");
		r = await api("GET", "/admin/dashboard-stats", { token: admin });
		check("Dashboard stats -> 200", r.status === 200 && r.json.data.reports.RESOLVED >= 1 && r.json.data.network.areas >= 2);
		r = await api("GET", `/admin/users?searchTerm=${TAG}`, { token: admin });
		check("Admin lists test users (admin + 3 customers + 2 techs = 6)", r.json?.meta?.total === 6, r.json?.meta?.total);
		r = await api("PATCH", `/admin/users/${tech2.id}/block`, { token: admin, body: { status: "BLOCKED" } });
		check("Block technician 2 -> 200", r.status === 200 && r.json.data.status === "BLOCKED");
		r = await api("GET", "/users/me", { token: t2 });
		check("Blocked user's token rejected", r.status === 401 || r.status === 403, r.status);
		r = await api("POST", "/auth/login", { body: { email: tech2.email, password: "Tech1234" } });
		check("Blocked user can't log in -> 403", r.status === 403);
		r = await api("PATCH", `/admin/users/${tech2.id}/block`, { token: admin, body: { status: "ACTIVE" } });
		t2 = await login(tech2.email, "Tech1234");
		check("Unblock -> can log in again", r.status === 200 && !!t2);
		r = await api("PATCH", `/admin/users/${c3.id}/role`, { token: admin, body: { role: "TECHNICIAN" } });
		check("Change role CUSTOMER -> TECHNICIAN -> 200", r.status === 200 && r.json.data.role === "TECHNICIAN");
		r = await api("GET", "/users/me", { token: k3 });
		check("Session invalidated after role change -> 401", r.status === 401);
		k3 = await login(c3.email, "Pass1234");
		r = await api("GET", "/technicians/my-jobs", { token: k3 });
		check("New role works after re-login", r.status === 200);
		r = await api("PATCH", `/admin/users/${testAdmin.id}/role`, { token: admin, body: { role: "CUSTOMER" } });
		check("Admin can't change own role -> 403", r.status === 403);
		r = await api("PATCH", `/admin/users/${testAdmin.id}/block`, { token: admin, body: { status: "BLOCKED" } });
		check("Admin can't block self -> 403", r.status === 403);
		r = await api("GET", `/admin/audit-logs?userId=${testAdmin.id}&action=TECHNICIAN_CREATED`, { token: admin });
		check("Audit logs filtered by admin + action -> 2", r.json?.meta?.total === 2);
		r = await api("GET", `/admin/audit-logs?entityId=${c3.id}`, { token: admin });
		check("Audit log for role change has old/new role", r.json?.data?.[0]?.details?.oldRole === "CUSTOMER" && r.json.data[0].details.newRole === "TECHNICIAN");

		// Last-admin guard (called directly on the service).
		// Only runs when your real admin is the ONLY active admin besides the test admin.
		const otherActiveAdmins = await prisma.user.count({
			where: { role: "ADMIN", status: "ACTIVE", deletedAt: null, NOT: { id: testAdmin.id } },
		});
		if (realAdmins.length === 1 && otherActiveAdmins === 1) {
			// Temporarily make the test admin a customer -> the real admin is the last active admin
			await prisma.user.update({ where: { id: testAdmin.id }, data: { role: "CUSTOMER" } });
			const requester = { userId: testAdmin.id, name: testAdmin.name, email: testAdmin.email, role: "ADMIN" as const };
			let error: any = null;
			try {
				await AdminService.changeStatus(realAdmins[0].id, { status: "BLOCKED" }, requester);
			} catch (e) {
				error = e;
			}
			check("Last active admin can't be blocked -> 409", error?.statusCode === 409, error?.message);
			error = null;
			try {
				await AdminService.changeRole(realAdmins[0].id, { role: "CUSTOMER" }, requester);
			} catch (e) {
				error = e;
			}
			check("Last active admin can't be demoted -> 409", error?.statusCode === 409, error?.message);
			const after = await prisma.user.findUniqueOrThrow({ where: { id: realAdmins[0].id } });
			check("Real admin unchanged", after.role === "ADMIN" && after.status === realAdmins[0].status);
			await prisma.user.update({ where: { id: testAdmin.id }, data: { role: "ADMIN" } });
			admin = await login(adminEmail, "Admin1234");
		} else {
			console.log("SKIP | Last-admin guard test (needs exactly one real admin)");
		}

		// =================================================================
		section("SECURITY: authentication + RBAC on every protected endpoint");
		type Role = "ADMIN" | "CUSTOMER" | "TECHNICIAN";
		const ANY: Role[] = ["ADMIN", "CUSTOMER", "TECHNICIAN"];
		const id = FAKE_ID;
		// [method, path, roles allowed]
		const protectedRoutes: [string, string, Role[]][] = [
			["POST", "/auth/logout", ANY],
			["GET", "/users/me", ANY],
			["PATCH", "/users/me", ANY],
			["PATCH", "/users/me/change-password", ANY],
			["POST", "/zones", ["ADMIN"]],
			["PATCH", `/zones/${id}`, ["ADMIN"]],
			["DELETE", `/zones/${id}`, ["ADMIN"]],
			["POST", "/substations", ["ADMIN"]],
			["PATCH", `/substations/${id}`, ["ADMIN"]],
			["DELETE", `/substations/${id}`, ["ADMIN"]],
			["POST", "/feeders", ["ADMIN"]],
			["PATCH", `/feeders/${id}`, ["ADMIN"]],
			["DELETE", `/feeders/${id}`, ["ADMIN"]],
			["POST", "/areas", ["ADMIN"]],
			["PATCH", `/areas/${id}`, ["ADMIN"]],
			["DELETE", `/areas/${id}`, ["ADMIN"]],
			["POST", "/outages", ["ADMIN"]],
			["PATCH", `/outages/${id}`, ["ADMIN"]],
			["DELETE", `/outages/${id}`, ["ADMIN"]],
			["POST", "/outage-reports", ["CUSTOMER"]],
			["GET", "/outage-reports/my-reports", ["CUSTOMER"]],
			["GET", "/outage-reports", ["ADMIN"]],
			["GET", `/outage-reports/${id}`, ["ADMIN", "CUSTOMER"]],
			["PATCH", `/outage-reports/${id}/status`, ["ADMIN"]],
			["POST", "/assignments", ["ADMIN"]],
			["GET", "/assignments", ["ADMIN"]],
			["PATCH", `/assignments/${id}/technician`, ["ADMIN"]],
			["GET", `/assignments/${id}`, ["ADMIN", "TECHNICIAN"]],
			["PATCH", `/assignments/${id}/status`, ["TECHNICIAN"]],
			["POST", `/assignments/${id}/repair-report`, ["TECHNICIAN"]],
			["GET", "/technicians/my-jobs", ["TECHNICIAN"]],
			["GET", "/technicians/my-history", ["TECHNICIAN"]],
			["GET", "/notifications", ANY],
			["PATCH", `/notifications/${id}/read`, ANY],
			["PATCH", "/notifications/read-all", ANY],
			["POST", "/bills", ["ADMIN"]],
			["GET", "/bills/my-bills", ["CUSTOMER"]],
			["GET", "/bills", ["ADMIN"]],
			["POST", "/payments/initiate", ["CUSTOMER"]],
			["GET", "/payments/my-payments", ["CUSTOMER"]],
			["GET", "/admin/dashboard-stats", ["ADMIN"]],
			["GET", "/admin/users", ["ADMIN"]],
			["POST", "/admin/users/technicians", ["ADMIN"]],
			["PATCH", `/admin/users/${id}/role`, ["ADMIN"]],
			["PATCH", `/admin/users/${id}/block`, ["ADMIN"]],
			["GET", "/admin/audit-logs", ["ADMIN"]],
		];
		const tokens: Record<Role, string> = { ADMIN: admin, CUSTOMER: k1, TECHNICIAN: t1 };
		const noTokenFails: string[] = [];
		const wrongRoleFails: string[] = [];
		for (const [method, path, roles] of protectedRoutes) {
			const res = await api(method, path, { body: {} });
			if (res.status !== 401) noTokenFails.push(`${method} ${path} -> ${res.status}`);
			for (const role of ANY.filter((x) => !roles.includes(x))) {
				const res2 = await api(method, path, { token: tokens[role], body: {} });
				if (res2.status !== 403) wrongRoleFails.push(`${role} ${method} ${path} -> ${res2.status}`);
			}
		}
		check(`No token -> 401 on all ${protectedRoutes.length} protected endpoints`, noTokenFails.length === 0, noTokenFails);
		check("Wrong role -> 403 on every role-restricted endpoint", wrongRoleFails.length === 0, wrongRoleFails);
		const forged = await api("GET", "/users/me", { token: "eyJhbGciOiJIUzI1NiJ9.eyJ1c2VySWQiOiJ4Iiwicm9sZSI6IkFETUlOIn0.forged" });
		check("Forged JWT -> 401", forged.status === 401);

		section("SECURITY: IDOR / ownership");
		const c1Notif = (await api("GET", "/notifications", { token: k1 })).json.data[0];
		r = await api("PATCH", `/notifications/${c1Notif.id}/read`, { token: k2 });
		check("Read another user's notification -> 404", r.status === 404);
		r = await api("PATCH", "/notifications/read-all", { token: k2 });
		const c1Unread = (await api("GET", "/notifications?unreadOnly=true", { token: k1 })).json.meta.total;
		check("Another user's read-all doesn't touch my notifications", c1Unread > 0, c1Unread);
		r = await api("GET", "/outage-reports/my-reports", { token: k1 });
		check("my-reports only returns own reports", r.json?.data?.every((x: any) => x.id !== report.id));

		section("SECURITY: input validation + SQL injection");
		r = await api("GET", "/zones/1%20OR%201=1");
		check("SQL-like id -> 400 (UUID validation)", r.status === 400);
		const injection = encodeURIComponent("' OR '1'='1' --");
		r = await api("GET", `/zones?searchTerm=${injection}`);
		check("SQL injection in searchTerm -> 200, 0 rows (treated as text)", r.status === 200 && r.json.meta.total === 0);
		r = await api("GET", `/outages/search?q=${injection}`);
		check("SQL injection in outage search -> 0 rows", r.status === 200 && r.json.meta.total === 0);
		r = await api("GET", `/admin/users?searchTerm=${encodeURIComponent("%'; DROP TABLE users; --")}`, { token: admin });
		check("DROP TABLE text in search -> harmless", r.status === 200 && (await prisma.user.count()) > 0);
		r = await api("POST", "/outages", { token: admin, body: { title: "x", areaId: "nope", startTime: "tomorrow", reason: "" } });
		check("Invalid body -> 400 with field errors", r.status === 400 && r.json.errors.length >= 3, r.json?.errors?.map((e: any) => e.path));
		r = await api("GET", "/outages?page=0&limit=1000&status=DONE");
		check("Invalid query -> 400", r.status === 400);

		section("SECURITY: passwords, tokens, secrets");
		const dbUser = await prisma.user.findUniqueOrThrow({ where: { id: c1.id } });
		check("Password stored as bcrypt hash", dbUser.password.startsWith("$2"));
		check("Refresh token stored as SHA-256 hash (64 hex)", /^[0-9a-f]{64}$/.test(dbUser.refreshTokenHash ?? ""));
		check("No response contained password / refreshTokenHash / store_passwd", leaks.length === 0, leaks);

		section("SECURITY: Helmet + CORS");
		const home = await fetch(`http://localhost:${PORT}/`, { headers: { Origin: "http://evil.example" } });
		check("Helmet headers present", !!home.headers.get("content-security-policy") && home.headers.get("x-content-type-options") === "nosniff");
		check("CORS only allows FRONTEND_URL", home.headers.get("access-control-allow-origin") === (process.env.FRONTEND_URL || "http://localhost:3000"), home.headers.get("access-control-allow-origin"));

		section("SOFT DELETE");
		r = await api("POST", "/areas", { token: admin, body: { name: `E2E Empty Area ${TAG}`, code: `E2E-C-${TAG}`, feederId: ids.feeder } });
		ids.areaC = r.json.data.id;
		r = await api("DELETE", `/areas/${ids.areaC}`, { token: admin });
		check("Delete empty area -> 200", r.status === 200);
		check("Row kept in DB with deletedAt", !!(await prisma.area.findUnique({ where: { id: ids.areaC } }))?.deletedAt);
		r = await api("GET", `/areas/${ids.areaC}`);
		check("Deleted area -> 404", r.status === 404);
		r = await api("DELETE", `/areas/${ids.areaA}`, { token: admin });
		check("Area with customers can't be deleted -> 409", r.status === 409);
		r = await api("DELETE", `/outages/${scheduled.id}`, { token: admin });
		check("Delete resolved outage -> 200 (soft)", r.status === 200);
		r = await api("GET", `/outages?areaId=${ids.areaA}`);
		check("Deleted outage hidden from public list", !r.json?.data?.some((o: any) => o.id === scheduled.id));

		section("DASHBOARD: Asia/Dhaka month start");
		check("21 Nov 2026 -> 1 Nov 00:00 Dhaka (= 31 Oct 18:00 UTC)", getDhakaMonthStart(new Date("2026-11-21T10:00:00Z")).toISOString() === "2026-10-31T18:00:00.000Z");
		check("30 Nov 19:00 UTC is 1 Dec in Dhaka -> month starts 30 Nov 18:00 UTC", getDhakaMonthStart(new Date("2026-11-30T19:00:00Z")).toISOString() === "2026-11-30T18:00:00.000Z");
		check("30 Nov 17:00 UTC is still Nov in Dhaka", getDhakaMonthStart(new Date("2026-11-30T17:00:00Z")).toISOString() === "2026-10-31T18:00:00.000Z");

		// =================================================================
		section("RATE LIMIT + production errors (2nd server, NODE_ENV=production)");
		const prodServer = await startServer(5056, { NODE_ENV: "production", RATE_LIMIT_MAX: "8", AUTH_RATE_LIMIT_MAX: "3" });
		try {
			const P = "http://localhost:5056/api/v1";
			r = await api("GET", "/zones/not-a-uuid", { base: P });
			check("Production error has no stack trace", r.status === 400 && !("stack" in r.json) && r.json.success === false);
			const loginCodes: number[] = [];
			for (let i = 0; i < 4; i++) loginCodes.push((await api("POST", "/auth/login", { base: P, body: { email: "nobody@test.com", password: "Wrong1234" } })).status);
			check("4th failed login -> 429 (AUTH limit 3)", loginCodes.join(",") === "401,401,401,429", loginCodes);
			const codes: number[] = [];
			for (let i = 0; i < 6; i++) codes.push((await api("GET", "/zones", { base: P })).status);
			r = await api("GET", "/zones", { base: P });
			check("General limit (8) -> 429 with standard error format", codes.includes(429) && r.status === 429 && r.json.success === false && Array.isArray(r.json.errors), codes);
		} finally {
			prodServer.kill();
		}
	} catch (error) {
		failed++;
		failures.push(`Crashed: ${(error as Error).message}`);
		console.error("TEST CRASHED:", error);
	} finally {
		server?.kill();
		await cleanup(realAdminSnapshot);
		console.log(`\nHTTP requests: ${requestCount}`);
		console.log(`RESULT: ${passed} passed, ${failed} failed`);
		if (failures.length) console.log("Failed:", failures);
		await prisma.$disconnect();
		process.exitCode = failed > 0 ? 1 : 0;
	}
};

// Deletes everything this run created (children first)
const cleanup = async (realAdminSnapshot: { id: string; role: any; status: any }[]) => {
	// Safety: restore the real admin(s) if anything changed
	for (const a of realAdminSnapshot) {
		await prisma.user.update({ where: { id: a.id }, data: { role: a.role, status: a.status } });
	}
	const users = ids.users;
	const reports = await prisma.outageReport.findMany({ where: { customerId: { in: users } }, select: { id: true } });
	const jobs = await prisma.technicianAssignment.findMany({ where: { reportId: { in: reports.map((x) => x.id) } }, select: { id: true } });
	const outages = await prisma.outage.findMany({ where: { area: { code: { contains: TAG } } }, select: { id: true } });
	const bills = await prisma.bill.findMany({ where: { customerId: { in: users } }, select: { id: true } });
	const payments = await prisma.payment.findMany({ where: { customerId: { in: users } }, select: { id: true } });
	const entityIds = [...users, ...reports, ...jobs, ...outages, ...bills, ...payments].map((x) => (typeof x === "string" ? x : x.id));
	const networkIds = [ids.zone, ids.substation, ids.feeder, ids.areaA, ids.areaB, ids.areaC].filter(Boolean);

	await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...entityIds, ...networkIds] } }, { userId: { in: users } }] } });
	await prisma.notification.deleteMany({ where: { userId: { in: users } } });
	// Notifications this run sent to real admins (they all mention the tag)
	await prisma.notification.deleteMany({
		where: { userId: { in: realAdminSnapshot.map((a) => a.id) }, createdAt: { gte: startedAt }, message: { contains: TAG } },
	});
	await prisma.repairRecord.deleteMany({ where: { assignmentId: { in: jobs.map((x) => x.id) } } });
	await prisma.technicianAssignment.deleteMany({ where: { id: { in: jobs.map((x) => x.id) } } });
	await prisma.outageReport.deleteMany({ where: { id: { in: reports.map((x) => x.id) } } });
	await prisma.payment.deleteMany({ where: { id: { in: payments.map((x) => x.id) } } });
	await prisma.bill.deleteMany({ where: { id: { in: bills.map((x) => x.id) } } });
	await prisma.outage.deleteMany({ where: { id: { in: outages.map((x) => x.id) } } });
	await prisma.user.deleteMany({ where: { id: { in: users } } });
	await prisma.area.deleteMany({ where: { code: { contains: TAG } } });
	await prisma.feeder.deleteMany({ where: { code: { contains: TAG } } });
	await prisma.substation.deleteMany({ where: { code: { contains: TAG } } });
	await prisma.distributionZone.deleteMany({ where: { code: { contains: TAG } } });
	console.log(`\nCleanup: removed all records tagged ${TAG}`);
};

main();
