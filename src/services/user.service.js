import mongoose from "mongoose";
import User from "../models/User.js";
import { toCustomerUserDTO, toAdminUserDTO } from "../dto/user.dto.js";
import { normalizeName } from "../utils/text.js";
import { normalizePagination } from "../utils/pagination.js";
import { HttpError } from "../utils/http-error.js";
import { deleteImage, IMAGE_RULES, MANAGED_IMAGE_ID_PATTERN } from "../config/cloudinary.js";


const profileFields = ["fullName", "phoneNumber", "dateOfBirth", "gender"];
const addressFields = [
  "recipientName",
  "phoneNumber",
  "streetAddress",
  "ward",
  "district",
  "city",
  "isDefault",
];

const checkFields = (input, allowed) => {
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !allowed.includes(field))
  ) {
    throw new HttpError(
      400,
      "Thông tin người dùng chứa trường không được hỗ trợ hoặc không được phép chỉnh sửa.",
    );
  }
  for (const [field, value] of Object.entries(input)) {
    if (field === "isDefault") {
      if (typeof value !== "boolean")
        throw new HttpError(
          400,
          "isDefault phải là giá trị đúng hoặc sai (boolean).",
        );
    } else if (
      field !== "dateOfBirth" &&
      value != null &&
      typeof value !== "string"
    ) {
      throw new HttpError(400, "Thông tin người dùng phải có kiểu chuỗi.");
    }
  }
};

// Caller lấy userId từ tài khoản đã xác thực, không lấy từ request body.
const loadUser = async (userId, session) => {
  if (!mongoose.isObjectIdOrHexString(userId))
    throw new HttpError(400, "Vui lòng cung cấp ID người dùng hợp lệ.");
  const user = await User.findById(userId).session(session ?? null);
  if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
  if (!user.isActive) throw new HttpError(403, "Tài khoản đã bị vô hiệu hóa.");
  return user;
};

const saveUser = async (user, session) => {
  // Kiểm tra lại trạng thái khóa ngay trong thao tác ghi.
  user.$where = { isActive: true };
  try {
    await user.save({ session });
    return toCustomerUserDTO(user);
  } catch (error) {
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(400, "Thông tin người dùng không hợp lệ.");
    if (error instanceof mongoose.Error.VersionError)
      throw new HttpError(
        409,
        "Thông tin người dùng đã được thay đổi. Vui lòng tải lại trước khi cập nhật.",
      );
    if (error instanceof mongoose.Error.DocumentNotFoundError)
      throw new HttpError(404, "Tài khoản người dùng không còn khả dụng.");
    if (error.code === 11000)
      throw new HttpError(
        409,
        "Thông tin người dùng bị trùng với tài khoản đã tồn tại.",
      );
    throw error;
  }
};

export const updateProfile = async (
  userId, fullName, phoneNumber, dateOfBirth, gender, session,
) => {
  const input = Object.fromEntries(
    Object.entries({ fullName, phoneNumber, dateOfBirth, gender })
      .filter(([, value]) => value !== undefined),
  );
  checkFields(input, profileFields);
  const user = await loadUser(userId, session);
  for (const field of Object.keys(input)) {
    let value = input[field];
    if (field === "fullName") {
      value = normalizeName(value);
      if (typeof value !== "string" || !value || value.length > 200) {
        throw new HttpError(
          400,
          "Họ tên là bắt buộc và không được vượt quá 200 ký tự.",
        );
      }
    }
    if (field === "dateOfBirth" && value != null) {
      const date =
        typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
          ? new Date(value)
          : new Date(NaN);
      if (
        !Number.isFinite(date.getTime()) ||
        date.toISOString().slice(0, 10) !== value ||
        date > new Date()
      ) {
        throw new HttpError(
          400,
          "Ngày sinh phải hợp lệ, có định dạng YYYY-MM-DD và không được ở tương lai.",
        );
      }
      value = date;
    }
    user.set(field, value);
  }
  return saveUser(user, session);
};

export const addAddress = async (
  userId, recipientName, phoneNumber, streetAddress, ward, district, city, isDefault, session,
) => {
  const input = Object.fromEntries(
    Object.entries({ recipientName, phoneNumber, streetAddress, ward, district, city, isDefault })
      .filter(([, value]) => value !== undefined),
  );
  checkFields(input, addressFields);
  const user = await loadUser(userId, session);
  if (input.isDefault === true)
    user.addresses.forEach((address) => {
      address.isDefault = false;
    });
  const address = {};
  for (const field of Object.keys(input)) address[field] = input[field];
  user.addresses.push(address);
  // Dùng versioning mặc định riêng cho thao tác địa chỉ, không bật optimisticConcurrency.
  user.increment();
  return saveUser(user, session);
};

export const updateAddress = async (
  userId,
  addressId,
  recipientName, phoneNumber, streetAddress, ward, district, city, isDefault, session,
) => {
  const input = Object.fromEntries(
    Object.entries({ recipientName, phoneNumber, streetAddress, ward, district, city, isDefault })
      .filter(([, value]) => value !== undefined),
  );
  checkFields(input, addressFields);
  if (!mongoose.isObjectIdOrHexString(addressId))
    throw new HttpError(400, "Vui lòng cung cấp ID địa chỉ hợp lệ.");
  const user = await loadUser(userId, session);
  const address = user.addresses.id(addressId);
  if (!address) throw new HttpError(404, "Không tìm thấy địa chỉ.");
  if (input.isDefault === true)
    user.addresses.forEach((item) => {
      item.isDefault = false;
    });
  for (const field of Object.keys(input)) address.set(field, input[field]);
  user.increment();
  return saveUser(user, session);
};

export const removeAddress = async (userId, addressId, session) => {
  if (!mongoose.isObjectIdOrHexString(addressId))
    throw new HttpError(400, "Vui lòng cung cấp ID địa chỉ hợp lệ.");
  const user = await loadUser(userId, session);
  const address = user.addresses.id(addressId);
  if (!address) throw new HttpError(404, "Không tìm thấy địa chỉ.");
  address.deleteOne();
  user.increment();
  return saveUser(user, session);
};

const adminFields = "fullName email phoneNumber avatar role isActive emailVerified isEmailVerified emailVerifiedAt createdAt updatedAt";

export const listUsers = async (page = 1, limit = 20, search, isActive) => {
  ({ page, limit } = normalizePagination(page, limit));
  if (search) search = normalizeName(search);
  const filter = { role: "user" };
  if (isActive !== undefined) filter.isActive = isActive === true || isActive === "true";
  if (search) {
    const pattern = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
    filter.$or = ["fullName", "email", "phoneNumber"].map(field => ({ [field]: pattern }));
  }
  const [users, total] = await Promise.all([
    User.find(filter).select(adminFields).sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    User.countDocuments(filter),
  ]);
  return {
    data: users.map(toAdminUserDTO),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getUser = async (userId) => {
  const user = await User.findOne({ _id: userId, role: "user" }).select(adminFields).lean();
  if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
  return toAdminUserDTO(user);
};

export const updateUserStatus = async (userId, isActive) => {
  const user = await User.findById(userId).select("+tokenVersion");
  if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
  if (user.role !== "user")
    throw new HttpError(403, "Không thể thay đổi trạng thái tài khoản quản trị viên.");
  if (user.isActive === isActive) return toAdminUserDTO(user);
  const previousStatus = user.isActive;
  const version = user.tokenVersion ?? 0;
  user.isActive = isActive;
  user.$inc("tokenVersion", 1);
  user.increment();
  user.$where = {
    role: "user", isActive: previousStatus,
    ...(version === 0
      ? { $or: [{ tokenVersion: 0 }, { tokenVersion: { $exists: false } }] }
      : { tokenVersion: version }),
  };
  try {
    await user.save();
    return toAdminUserDTO(user);
  } catch (error) {
    if (error instanceof mongoose.Error.DocumentNotFoundError || error instanceof mongoose.Error.VersionError)
      throw new HttpError(409, "Tài khoản đã thay đổi. Vui lòng tải lại trước khi cập nhật.");
    if (error instanceof mongoose.Error.ValidationError)
      throw new HttpError(400, "Thông tin người dùng không hợp lệ.");
    throw error;
  }
};

export const updateAvatar = async (userId, uploaded, authenticatedUser) => {
  const user = authenticatedUser ?? await loadUser(userId);
  const previous = user.avatar
    ? { provider: user.avatar.provider, publicId: user.avatar.publicId }
    : null;

  let data;
  try {
    user.avatar = { ...uploaded, provider: "cloudinary" };
    user.increment();
    data = await saveUser(user);
  } catch (error) {
    // Khi lỗi ghi không rõ kết quả, xác minh trước khi xóa để tránh xóa ảnh đã được lưu.
    let canCleanup =
      error instanceof HttpError && [400, 404, 409].includes(error.status);
    if (!canCleanup) {
      try {
        canCleanup = !(await User.exists({
          _id: userId,
          "avatar.publicId": uploaded.publicId,
        }));
      } catch {
        /* Không xóa nếu không xác minh được trạng thái lưu. */
      }
    }
    if (!canCleanup) Object.defineProperty(error, "uploadCommitted", { value: true });
    throw error;
  }
  if (
    previous?.provider === "cloudinary" &&
    typeof previous.publicId === "string" &&
    previous.publicId.startsWith(`${IMAGE_RULES.avatar.folder}/`) &&
    MANAGED_IMAGE_ID_PATTERN.test(previous.publicId) &&
    previous.publicId !== uploaded.publicId
  ) {
    try {
      await deleteImage(previous.publicId);
    } catch {
      return {
        user: data,
        warning: "Đã cập nhật ảnh đại diện. Cần thử xóa ảnh cũ một lần nữa.",
      };
    }
  }
  return { user: data };
};
