// Đăng ký trước mongoose.model(). Không chặn thao tác ghi vào collection của save.
// Cơ chế này yêu cầu kiểm tra toàn bộ tài liệu; không kiểm soát quyền truy cập API.
export function requireDocumentSave(schema, modelName) {
  for (const operation of [
    "updateOne",
    "updateMany",
    "findOneAndUpdate",
    "replaceOne",
    "findOneAndReplace",
  ]) {
    schema.pre(operation, function rejectQueryUpdate() {
      throw new Error(
        `Cập nhật ${modelName} phải dùng document.save() để kiểm tra dữ liệu và xung đột cập nhật đồng thời.`,
      );
    });
  }
  schema.pre("bulkWrite", function rejectBulkWrite() {
    throw new Error(
      `${modelName} không hỗ trợ bulkWrite; hãy dùng document.save() để kiểm tra dữ liệu.`,
    );
  });
}
