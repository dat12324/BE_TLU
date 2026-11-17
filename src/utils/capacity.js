// Dung lượng được tính bằng GB; hỗ trợ chuỗi GB/TB từ dữ liệu import cũ.
export const normalizeCapacity = (value) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\s*(GB|TB)?$/i);
  if (!match) return null;
  const capacity = Number(match[1]) * (match[2]?.toUpperCase() === "TB" ? 1024 : 1);
  return Number.isSafeInteger(capacity) && capacity > 0 ? capacity : null;
};
