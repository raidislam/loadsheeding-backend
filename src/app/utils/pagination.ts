// page=2, limit=10 -> skip the first 10 rows, take the next 10
export const getSkip = (page: number, limit: number) => (page - 1) * limit;

// Builds the "meta" object sent with every list response
export const buildMeta = (page: number, limit: number, total: number) => ({
	page,
	limit,
	total,
	totalPages: Math.ceil(total / limit),
});
