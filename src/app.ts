import cors from "cors";
import express, { type Application, type Request, type Response } from "express";
import helmet from "helmet";
import httpStatus from "http-status";
import config from "./app/config";
import { globalErrorHandler } from "./app/middleware/globalErrorHandler";
import { notFound } from "./app/middleware/notFound";
import { apiLimiter } from "./app/middleware/rateLimiter";

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

// Module routes go here, e.g.:
// app.use("/api/v1/auth", AuthRoutes);

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
