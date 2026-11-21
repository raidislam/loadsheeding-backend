/**
 * Real SSLCommerz sandbox payment test (needs a human for the card page).
 *
 *   1. npm run dev                       (keep it running: SSLCommerz sends the browser back to BACKEND_URL)
 *   2. npm run test:payment -- start     -> prints a payment link
 *   3. open the link, pay with the sandbox test card
 *   4. npm run test:payment -- verify    -> checks the result + duplicate protection, then cleans up
 *      (npm run test:payment -- cleanup  -> only removes the test data)
 */
import "dotenv/config";
import bcrypt from "bcryptjs";
import fs from "fs";
import path from "path";
import { prisma } from "../src/app/lib/prisma";

const BASE = `${process.env.BACKEND_URL || "http://localhost:5000"}/api/v1`;
const STATE_FILE = path.join(process.cwd(), "tests", ".payment-state.json");
const AMOUNT = 300.75;

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, info: unknown = "") => {
	ok ? passed++ : failed++;
	console.log(`${ok ? "PASS" : "FAIL"} | ${name}${info === "" ? "" : ` | ${JSON.stringify(info)}`}`);
};

const api = async (method: string, p: string, body?: unknown, token?: string) => {
	const res = await fetch(BASE + p, {
		method,
		headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
		body: body ? JSON.stringify(body) : undefined,
	});
	return { status: res.status, json: (await res.json().catch(() => null)) as any };
};
const postForm = async (p: string, form: Record<string, string>) => {
	const res = await fetch(BASE + p, { method: "POST", body: new URLSearchParams(form), redirect: "manual" });
	return { status: res.status, location: res.headers.get("location") ?? "", text: await res.text() };
};
const login = async (email: string, password: string) => (await api("POST", "/auth/login", { email, password })).json?.data?.accessToken;

const start = async () => {
	const tag = Date.now().toString(36).toUpperCase();
	const admin = await prisma.user.create({
		data: { name: `PAY Admin ${tag}`, email: `pay.${tag.toLowerCase()}.admin@test.com`, password: await bcrypt.hash("Admin1234", 10), role: "ADMIN" },
	});
	const customer = await prisma.user.create({
		data: { name: `PAY Customer ${tag}`, email: `pay.${tag.toLowerCase()}.customer@test.com`, password: await bcrypt.hash("Pass1234", 10), phone: "01700000000", address: "Dhaka" },
	});
	const adminToken = await login(admin.email, "Admin1234");
	const customerToken = await login(customer.email, "Pass1234");

	const bill = await api("POST", "/bills", { customerId: customer.id, billMonth: "2026-11", unitsConsumed: 90, amount: AMOUNT, dueDate: "2026-12-31" }, adminToken);
	const init = await api("POST", "/payments/initiate", { billId: bill.json.data.id }, customerToken);

	if (init.status !== 201) {
		console.log("Could not start the payment:", init.json?.message);
		return;
	}

	fs.writeFileSync(
		STATE_FILE,
		JSON.stringify({ tag, adminId: admin.id, customerId: customer.id, customerEmail: customer.email, billId: bill.json.data.id, ...init.json.data }, null, 2),
	);
	console.log(`\nBill of ${AMOUNT} BDT created. Open this link and pay with the sandbox test card:\n\n${init.json.data.gatewayUrl}\n`);
	console.log("Card 4111 1111 1111 1111, any future expiry, CVV 111 (OTP 111111 if asked).");
	console.log("Then run: npm run test:payment -- verify");
};

const verify = async (s: any) => {
	console.log("\n=== REAL PAYMENT RESULT ===");
	const payment = await prisma.payment.findUniqueOrThrow({ where: { id: s.paymentId } });
	check("Payment SUCCESS", payment.status === "SUCCESS", payment.status);
	check("val_id, bank transaction id, card type saved", !!payment.valId && !!payment.bankTransactionId && !!payment.cardType, payment.cardType);
	const gw = payment.gatewayResponse as any;
	check("SSLCommerz validation: VALID + same tran_id + same amount", ["VALID", "VALIDATED"].includes(gw?.status) && gw?.tran_id === s.transactionId && Number(gw?.amount) === AMOUNT, { status: gw?.status, amount: gw?.amount });
	const bill = await prisma.bill.findUniqueOrThrow({ where: { id: s.billId } });
	check("Bill PAID", bill.status === "PAID" && !!bill.paidAt);
	check("Exactly 1 'Payment successful' notification", (await prisma.notification.count({ where: { userId: s.customerId, title: "Payment successful" } })) === 1);
	check("Exactly 1 PAYMENT_SUCCESS audit log", (await prisma.auditLog.count({ where: { entityId: s.paymentId, action: "PAYMENT_SUCCESS" } })) === 1);

	console.log("\n=== DUPLICATE PROTECTION (replay the real val_id) ===");
	const replay = await postForm("/payments/success", { tran_id: s.transactionId, val_id: payment.valId as string, status: "VALID" });
	check("Replayed success callback -> redirect to /payment/success", replay.status === 303 && replay.location.includes("/payment/success"), replay.location);
	const ipn = await postForm("/payments/ipn", { tran_id: s.transactionId, val_id: payment.valId as string, status: "VALID" });
	check("IPN with same val_id -> alreadyProcessed", JSON.parse(ipn.text)?.data?.alreadyProcessed === true);
	check("Still 1 audit log + 1 notification", (await prisma.auditLog.count({ where: { entityId: s.paymentId, action: "PAYMENT_SUCCESS" } })) === 1 && (await prisma.notification.count({ where: { userId: s.customerId, title: "Payment successful" } })) === 1);
	await postForm("/payments/cancel", { tran_id: s.transactionId, status: "CANCELLED" });
	await postForm("/payments/fail", { tran_id: s.transactionId, status: "FAILED" });
	check("Cancel/Fail callbacks can't undo SUCCESS", (await prisma.payment.findUniqueOrThrow({ where: { id: s.paymentId } })).status === "SUCCESS");
	const customerToken = await login(s.customerEmail, "Pass1234");
	const again = await api("POST", "/payments/initiate", { billId: s.billId }, customerToken);
	check("Paying a PAID bill again -> 409", again.status === 409, again.json?.message);
	const history = await api("GET", "/payments/my-payments?status=SUCCESS", undefined, customerToken);
	check("my-payments shows SUCCESS", history.json?.data?.[0]?.transactionId === s.transactionId);
	const adminToken = await login((await prisma.user.findUniqueOrThrow({ where: { id: s.adminId } })).email, "Admin1234");
	const stats = await api("GET", "/admin/dashboard-stats", undefined, adminToken);
	check("Dashboard thisMonthRevenue includes this payment", stats.json?.data?.payments?.thisMonthRevenue >= AMOUNT, stats.json?.data?.payments);
};

const cleanup = async (s: any) => {
	const users = [s.adminId, s.customerId];
	const payments = await prisma.payment.findMany({ where: { customerId: { in: users } }, select: { id: true } });
	const bills = await prisma.bill.findMany({ where: { customerId: { in: users } }, select: { id: true } });
	await prisma.auditLog.deleteMany({ where: { OR: [{ entityId: { in: [...payments, ...bills].map((x) => x.id) } }, { userId: { in: users } }] } });
	await prisma.notification.deleteMany({ where: { userId: { in: users } } });
	await prisma.payment.deleteMany({ where: { customerId: { in: users } } });
	await prisma.bill.deleteMany({ where: { customerId: { in: users } } });
	await prisma.user.deleteMany({ where: { id: { in: users } } });
	fs.rmSync(STATE_FILE, { force: true });
	console.log("\nCleanup: payment test data removed");
};

const main = async () => {
	const mode = process.argv[2];
	try {
		if (mode === "start") {
			await start();
		} else if (mode === "verify" || mode === "cleanup") {
			if (!fs.existsSync(STATE_FILE)) {
				console.log("No payment test in progress. Run: npm run test:payment -- start");
				return;
			}
			const state = JSON.parse(fs.readFileSync(STATE_FILE, "utf8"));
			try {
				if (mode === "verify") await verify(state);
			} finally {
				await cleanup(state);
			}
			if (mode === "verify") console.log(`\nRESULT: ${passed} passed, ${failed} failed`);
			process.exitCode = failed > 0 ? 1 : 0;
		} else {
			console.log("Usage: npm run test:payment -- start | verify | cleanup");
		}
	} finally {
		await prisma.$disconnect();
	}
};

main();
