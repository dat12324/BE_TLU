// Dùng chung cho thuộc tính ảo của tài liệu và ánh xạ phản hồi lean/aggregation sau này.
// Không được coi giá trị thiếu/không hợp lệ là số lượng khả dụng đã được xác minh.
export function getInventoryStatus({
  stock,
  reservedStock,
  lowStockThreshold,
}) {
  if (stock === null) return null;
  if (
    ![stock, reservedStock, lowStockThreshold].every(
      (value) => Number.isSafeInteger(value) && value >= 0,
    ) ||
    reservedStock > stock
  )
    return null;
  const availableStock = stock - reservedStock;
  if (availableStock === 0) return "out_of_stock";
  return availableStock <= lowStockThreshold ? "low_stock" : "in_stock";
}
