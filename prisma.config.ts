import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
	schema: "prisma/schema",
	migrations: {
		path: "prisma/migrations",
	},
	datasource: {
		// Prisma CLI (migrate, studio) uses the DIRECT (unpooled) Neon URL,
		// because migrations do not work well through the connection pooler.
		// The running app uses DATABASE_URL (pooled) in src/app/lib/prisma.ts.
		// Plain process.env (not env()) so `prisma generate` also works without a URL.
		url: process.env.DIRECT_URL ?? process.env.DATABASE_URL ?? "",
	},
});
