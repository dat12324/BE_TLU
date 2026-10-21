// Trả về định nghĩa trường Mongoose mới cho từng đường dẫn trong schema.
// Giá trị tùy chọn có thể là null/undefined; số được cung cấp phải hữu hạn.
export function numericSpec(positive = false) {
  return {
    type: Number,
    validate: {
      validator: value => value == null || (Number.isFinite(value) && (positive ? value > 0 : value >= 0)),
      message: positive ? 'Value must be finite and greater than zero.' : 'Value must be finite and non-negative.',
    },
  };
}
