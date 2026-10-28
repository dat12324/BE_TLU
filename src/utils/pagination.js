export const normalizePagination = (page, limit) => {
  const pagination = { page: 1, limit: 20 };
  for (const [key, value] of Object.entries({ page, limit })) {
    const number = typeof value === "number" ? value
      : typeof value === "string" && /^\d+$/.test(value) ? Number(value) : NaN;
    if (Number.isSafeInteger(number) && number > 0) pagination[key] = number;
  }
  pagination.limit = Math.min(pagination.limit, 100);
  if (!Number.isSafeInteger((pagination.page - 1) * pagination.limit))
    pagination.page = 1;
  return pagination;
};
