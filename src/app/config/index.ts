import dotenv from "dotenv";
import path from "path";

dotenv.config({ path: path.join(process.cwd(), ".env") });

export default {
	node_env: process.env.NODE_ENV || "development",
	port: process.env.PORT || 5000,
	backend_url: process.env.BACKEND_URL || "http://localhost:5000",
	frontend_url: process.env.FRONTEND_URL || "http://localhost:3000",
	bcrypt_salt_rounds: Number(process.env.BCRYPT_SALT_ROUNDS) || 10,

	// Requests allowed per IP every 15 minutes
	rate_limit_max: Number(process.env.RATE_LIMIT_MAX) || 100, // all /api/v1 routes
	auth_rate_limit_max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 10, // failed login/register

	jwt_access_secret: process.env.JWT_ACCESS_SECRET!,
	jwt_refresh_secret: process.env.JWT_REFRESH_SECRET!,
	jwt_access_expires_in: process.env.JWT_ACCESS_EXPIRES_IN || "15m",
	jwt_refresh_expires_in: process.env.JWT_REFRESH_EXPIRES_IN || "7d",

	admin_name: process.env.ADMIN_NAME!,
	admin_email: process.env.ADMIN_EMAIL!,
	admin_password: process.env.ADMIN_PASSWORD!,

	sslcommerz: {
		store_id: process.env.SSLCOMMERZ_STORE_ID!,
		store_password: process.env.SSLCOMMERZ_STORE_PASSWORD!,
		is_live: process.env.SSLCOMMERZ_IS_LIVE === "true",
		// If empty, the callback URLs are built from BACKEND_URL
		success_url: process.env.SSLCOMMERZ_SUCCESS_URL || "",
		fail_url: process.env.SSLCOMMERZ_FAIL_URL || "",
		cancel_url: process.env.SSLCOMMERZ_CANCEL_URL || "",
		ipn_url: process.env.SSLCOMMERZ_IPN_URL || "",
	},
};
