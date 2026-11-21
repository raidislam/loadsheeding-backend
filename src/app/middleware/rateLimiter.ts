import rateLimit from "express-rate-limit";
import config from "../config";

// Applied to every /api/v1 request: max RATE_LIMIT_MAX (default 100) requests per IP every 15 minutes.
export const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: config.rate_limit_max,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many requests. Please try again after 15 minutes.",
		errors: [],
	},
});

// Stricter limit for login / register to slow down password guessing.
// Only FAILED requests are counted, so normal users are not blocked.
export const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: config.auth_rate_limit_max, // default 10
	skipSuccessfulRequests: true,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many login attempts. Please try again after 15 minutes.",
		errors: [],
	},
});
