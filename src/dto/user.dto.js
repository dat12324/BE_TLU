// Danh sách trường được phép rõ ràng áp dụng cho tài liệu, kết quả lean và kết quả aggregation.
// Chỉ sử dụng sau khi đã kiểm tra quyền truy cập thông tin người dùng được yêu cầu.
const pick = (source, fields) => Object.fromEntries(
  fields.filter(field => source[field] !== undefined).map(field => [field, source[field]]),
);

function identity(user) {
  return {
    id: user._id?.toString(),
    ...pick(user, ['fullName', 'email', 'phoneNumber']),
    // Hỗ trợ chuỗi cũ trong kết quả lean/aggregation; giữ ID lưu trữ ở phía máy chủ.
    ...(user.avatar == null ? {} : {
      avatar: { url: typeof user.avatar === 'string' ? user.avatar.trim() : user.avatar.url },
    }),
  };
}

export function toCustomerUserDTO(user) {
  if (!user) return null;
  return {
    ...identity(user),
    ...pick(user, ['dateOfBirth', 'gender', 'isEmailVerified']),
    addresses: (user.addresses ?? []).map(address => ({
      id: address._id?.toString(),
      ...pick(address, [
        'recipientName', 'phoneNumber', 'streetAddress', 'ward', 'district', 'city', 'isDefault',
      ]),
    })),
  };
}

// Phản hồi xác thực cho tài khoản hiện tại cần vai trò hiện tại để điều hướng giao diện.
// Việc phân quyền vẫn kiểm tra cơ sở dữ liệu, không dùng vai trò do máy khách cung cấp.
export function toAuthUserDTO(user) {
  return user ? { ...toCustomerUserDTO(user), role: user.role } : null;
}

// Thông tin tóm tắt để quản trị tài khoản; không chứa địa chỉ, ngày sinh hoặc mã định danh nhà cung cấp.
export function toAdminUserDTO(user) {
  if (!user) return null;
  return {
    ...identity(user),
    ...pick(user, ['role', 'isActive', 'isEmailVerified', 'createdAt', 'updatedAt']),
  };
}
