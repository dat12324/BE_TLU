export const getAvailableStock = (sku) => {
  const { stock, reservedStock } = sku ?? {};
  if (!Number.isSafeInteger(stock) || !Number.isSafeInteger(reservedStock) ||
      stock < 0 || reservedStock < 0 || reservedStock > stock) return null;
  return stock - reservedStock;
};

// Dùng chung cho thuộc tính ảo của tài liệu và ánh xạ phản hồi lean/aggregation sau này.
// Không được coi giá trị thiếu/không hợp lệ là số lượng khả dụng đã được xác minh.
export const getInventoryStatus = ({
  stock,
  reservedStock,
  lowStockThreshold,
}) => {
  const availableStock = getAvailableStock({ stock, reservedStock });
  if (availableStock === null || !Number.isSafeInteger(lowStockThreshold) || lowStockThreshold < 0)
    return null;
  if (availableStock === 0) return "out_of_stock";
  return availableStock <= lowStockThreshold ? "low_stock" : "in_stock";
};
