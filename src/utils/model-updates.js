// Đăng ký trước mongoose.model(). Không chặn thao tác ghi vào collection của save.
// Cơ chế này yêu cầu kiểm tra toàn bộ tài liệu; không kiểm soát quyền truy cập API.
export function requireDocumentSave(schema, modelName) {
  for (const operation of ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace']) {
    schema.pre(operation, function rejectQueryUpdate() {
      throw new Error(`${modelName} updates must use document.save() for validation and concurrency checks.`);
    });
  }
  schema.pre('bulkWrite', function rejectBulkWrite() {
    throw new Error(`${modelName} bulkWrite is disabled; use validated document.save().`);
  });
}
