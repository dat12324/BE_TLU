import mongoose from "mongoose";
import User from "../models/User.js";
import { toCustomerUserDTO } from "../dto/user.dto.js";
import { normalizeName } from "../utils/text.js";
import { HttpError } from "../utils/http-error.js";
import { imageService } from "./image.service.js";
import {
  IMAGE_RULES,
  MANAGED_IMAGE_ID_PATTERN,
} from "../utils/image-validation.js";

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

function checkFields(input, allowed) {
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
}

// Caller lấy userId từ tài khoản đã xác thực, không lấy từ request body.
async function loadUser(userId, session) {
  if (!mongoose.isObjectIdOrHexString(userId))
    throw new HttpError(400, "Vui lòng cung cấp ID người dùng hợp lệ.");
  const user = await User.findById(userId).session(session ?? null);
  if (!user) throw new HttpError(404, "Không tìm thấy người dùng.");
  if (!user.isActive) throw new HttpError(403, "Tài khoản đã bị vô hiệu hóa.");
  return user;
}

async function saveUser(user, session) {
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
}

export async function updateProfile(userId, input, { session } = {}) {
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
}

export async function addAddress(userId, input, { session } = {}) {
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
}

export async function updateAddress(
  userId,
  addressId,
  input,
  { session } = {},
) {
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
}

export async function updateAvatar(userId, buffer) {
  const user = await loadUser(userId);
  const previous = user.avatar
    ? { provider: user.avatar.provider, publicId: user.avatar.publicId }
    : null;
  const uploaded = await imageService.uploadImage(buffer, "avatar");
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
    if (canCleanup) {
      try {
        await imageService.deleteImage(uploaded.publicId);
      } catch {
        const failure = new HttpError(
          502,
          "Cập nhật ảnh đại diện thất bại. Cần thử dọn dẹp ảnh đã tải lên một lần nữa.",
        );
        Object.defineProperty(failure, "cleanupPublicIds", {
          value: [uploaded.publicId],
        });
        throw failure;
      }
    }
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
      await imageService.deleteImage(previous.publicId);
    } catch {
      return {
        user: data,
        warning: "Đã cập nhật ảnh đại diện. Cần thử xóa ảnh cũ một lần nữa.",
      };
    }
  }
  return { user: data };
}
