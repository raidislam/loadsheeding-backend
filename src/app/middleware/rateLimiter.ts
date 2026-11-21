import rateLimit from "express-rate-limit";

// Applied to every /api/v1 request: max 100 requests per IP every 15 minutes.
export const apiLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 100,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many requests. Please try again after 15 minutes.",
		errors: [],
	},
});

// Stricter limit for login / register to slow down password guessing.
export const authLimiter = rateLimit({
	windowMs: 15 * 60 * 1000,
	limit: 10,
	standardHeaders: "draft-8",
	legacyHeaders: false,
	message: {
		success: false,
		message: "Too many login attempts. Please try again after 15 minutes.",
		errors: [],
	},
});
