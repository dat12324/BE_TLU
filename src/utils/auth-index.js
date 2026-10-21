// Mọi email đăng ký đều là chuỗi bắt buộc. Chỉ mục duy nhất bao phủ các
// chuỗi này (kể cả chỉ mục partial/sparse cũ) ngăn xung đột khi đăng ký đồng thời.
export function isUniqueEmailIndex(index) {
  if (index.unique !== true || index.key?.email !== 1 || Object.keys(index.key).length !== 1) return false;
  const partial = index.partialFilterExpression;
  if (!partial) return true;
  return Object.keys(partial).length === 1 && partial.email?.$type === 'string'
    && Object.keys(partial.email).length === 1;
}
