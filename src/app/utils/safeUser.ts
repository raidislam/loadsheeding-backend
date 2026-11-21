// Use with Prisma `omit` so these fields are never sent in an API response.
// Example: prisma.user.findUnique({ where: { id }, omit: safeUserOmit })
export const safeUserOmit = {
	password: true,
	refreshTokenHash: true,
} as const;
