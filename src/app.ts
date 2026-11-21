import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import helmet from "helmet";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { apiLimiter } from "./app/middleware/rateLimiter";
import { AdminRoutes } from "./app/module/admin/admin.route";
import { AreaRoutes } from "./app/module/area/area.route";
import { AssignmentRoutes, TechnicianRoutes } from "./app/module/assignment/assignment.route";
import { AuthRoutes } from "./app/module/auth/auth.route";
import { BillRoutes } from "./app/module/bill/bill.route";
import { PaymentRoutes } from "./app/module/payment/payment.route";
import { FeederRoutes } from "./app/module/feeder/feeder.route";
import { NotificationRoutes } from "./app/module/notification/notification.route";
import { OutageRoutes } from "./app/module/outage/outage.route";
import { OutageReportRoutes } from "./app/module/outageReport/outageReport.route";
import { SubstationRoutes } from "./app/module/substation/substation.route";
import { UserRoutes } from "./app/module/user/user.route";
import { ZoneRoutes } from "./app/module/zone/zone.route";

const app: Application = express();

// Behind Vercel's proxy: needed so rate limiting sees the real client IP
app.set("trust proxy", 1);

// Security headers
app.use(helmet());

// Only our frontend may call this API from a browser
app.use(
	cors({
		origin: config.frontend_url,
		credentials: true,
	}),
);

// Body parsers (urlencoded is needed for SSLCommerz callbacks)
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));

// Rate limit every API route
app.use("/api/v1", apiLimiter);

// Module routes
app.use("/api/v1/auth", AuthRoutes);
app.use("/api/v1/users", UserRoutes);
app.use("/api/v1/zones", ZoneRoutes);
app.use("/api/v1/substations", SubstationRoutes);
app.use("/api/v1/feeders", FeederRoutes);
app.use("/api/v1/areas", AreaRoutes);
app.use("/api/v1/outages", OutageRoutes);
app.use("/api/v1/outage-reports", OutageReportRoutes);
app.use("/api/v1/assignments", AssignmentRoutes);
app.use("/api/v1/technicians", TechnicianRoutes);
app.use("/api/v1/notifications", NotificationRoutes);
app.use("/api/v1/bills", BillRoutes);
app.use("/api/v1/payments", PaymentRoutes);
app.use("/api/v1/admin", AdminRoutes);

// Health check
app.get("/", (_req: Request, res: Response) => {
	res.status(httpStatus.OK).json({
		success: true,
		message: "Load Shedding & Power Outage Management API is running",
		data: null,
	});
});

app.use(notFound);
app.use(globalErrorHandler);

export default app;
