import mongoose from "mongoose";
import ProductVariant from "../models/ProductVariant.js";
import Product from "../models/Product.js";
import { normalizeName } from "../utils/text.js";
import { HttpError } from "../utils/http-error.js";

const colorKey = (value) =>
  typeof value === "string"
    ? normalizeName(value).toLowerCase().normalize("NFC")
    : null;

// So sánh dung lượng dạng chuỗi cũ mà không ghi lại bất kỳ giá trị RAM/ROM đã lưu nào.
const capacityKey = (value) => {
  if (typeof value === "number") return value;
  if (typeof value !== "string") return null;
  const match = value.trim().match(/^(\d+)\s*(GB|TB)?$/i);
  if (!match) return null;
  const capacity =
    Number(match[1]) * (match[2]?.toUpperCase() === "TB" ? 1024 : 1);
  return Number.isSafeInteger(capacity) && capacity > 0 ? capacity : null;
};

// Kiểm tra trước chỉ đọc cho thao tác ghi danh mục của quản trị viên. Chưa thêm Controller hoặc API CRUD.
// Phép chiếu trực tiếp giữ nguyên dung lượng dạng chuỗi cũ (Mongoose sẽ ép kiểu chúng).
export const assertUniqueVariantCombination = async (
  variant,
  session,
) => {
  const ram = capacityKey(variant.ram);
  const storage = capacityKey(variant.storage);
  if (
    !mongoose.isObjectIdOrHexString(variant.product) ||
    !colorKey(variant.color?.name) ||
    !Number.isSafeInteger(ram) ||
    ram <= 0 ||
    !Number.isSafeInteger(storage) ||
    storage <= 0
  ) {
    throw new HttpError(
      400,
      "Vui lòng cung cấp sản phẩm, RAM, bộ nhớ và tên màu hợp lệ.",
    );
  }
  const productId = new mongoose.Types.ObjectId(variant.product.toString());
  const filter = {
    product: { $in: [productId, productId.toHexString()] },
    deletedAt: null,
  };
  if (variant._id)
    filter._id = { $ne: new mongoose.Types.ObjectId(variant._id.toString()) };
  const candidates = await ProductVariant.collection
    .find(filter, {
      projection: { ram: 1, storage: 1, "color.name": 1 },
      session,
    })
    .toArray();
  const duplicate = candidates.some(
    (candidate) =>
      capacityKey(candidate.ram) === ram &&
      capacityKey(candidate.storage) === storage &&
      colorKey(candidate.color?.name) === colorKey(variant.color.name),
  );
  if (duplicate)
    throw new HttpError(
      409,
      "Biến thể có cùng sản phẩm, RAM, bộ nhớ và màu sắc đã tồn tại.",
    );
};

// Mã quản trị đã được cấp quyền sau này cung cấp tài liệu chỉ chứa các chỉnh sửa được cho phép rõ ràng.
// Thao tác ghi mới chuẩn hóa khoảng trắng bằng bộ gán hiện có của color.name;
// chỉ mục duy nhất không phân biệt hoa/thường xử lý xung đột giữa các lần ghi danh mục mới.
export const saveProductVariant = async (variant, session) => {
  if (!(variant instanceof ProductVariant))
    throw new TypeError("Dữ liệu phải là document biến thể sản phẩm.");
  await variant.validate();
  if (
    variant.compareAtPrice != null &&
    variant.compareAtPrice < variant.price
  ) {
    throw new HttpError(400, "Giá gốc phải lớn hơn hoặc bằng giá bán.");
  }
  if (variant.stock === undefined) {
    throw new HttpError(400, "Tồn kho chưa xác nhận phải được đặt rõ là null.");
  }
  if (variant.stock !== null && variant.reservedStock > variant.stock) {
    throw new HttpError(
      400,
      "Số lượng giữ hàng không được vượt quá tồn kho đã xác nhận.",
    );
  }
  // Helper lưu danh mục không được ghi đè tồn kho đang thay đổi bởi checkout.
  // Tồn kho hiện có phải cập nhật bằng service atomic riêng sau này.
  if (
    !variant.isNew &&
    (variant.isModified("stock") || variant.isModified("reservedStock"))
  ) {
    throw new HttpError(
      400,
      "Thay đổi tồn kho hiện có phải sử dụng cập nhật nguyên tử có điều kiện.",
    );
  }
  if (
    !(await Product.exists({ _id: variant.product }).session(session ?? null))
  ) {
    throw new HttpError(400, "Sản phẩm phải tồn tại.");
  }
  const excludeSelf = variant._id ? { _id: { $ne: variant._id } } : {};
  if (
    await ProductVariant.exists({ sku: variant.sku, ...excludeSelf }).session(
      session ?? null,
    )
  ) {
    throw new HttpError(409, "Mã SKU của biến thể đã tồn tại.");
  }
  if (
    variant.isDefault &&
    variant.status === "active" &&
    variant.deletedAt == null &&
    (await ProductVariant.exists({
      product: variant.product,
      isDefault: true,
      status: "active",
      deletedAt: null,
      ...excludeSelf,
    }).session(session ?? null))
  ) {
    throw new HttpError(
      409,
      "Sản phẩm đã có một biến thể mặc định đang hoạt động.",
    );
  }
  if (variant.deletedAt == null)
    await assertUniqueVariantCombination(variant, session);
  const previousWhere = variant.$where;
  // Giá và giá gốc có thể được sửa đồng thời; kiểm tra trường còn lại ngay khi ghi.
  if (!variant.isNew) {
    if (variant.isModified("price") && !variant.isModified("compareAtPrice")) {
      variant.$where = {
        ...variant.$where,
        $or: [
          { compareAtPrice: null },
          { compareAtPrice: { $gte: variant.price } },
        ],
      };
    } else if (
      variant.isModified("compareAtPrice") &&
      !variant.isModified("price") &&
      variant.compareAtPrice != null
    ) {
      variant.$where = {
        ...variant.$where,
        price: { $lte: variant.compareAtPrice },
      };
    }
  }
  try {
    return await variant.save({ session });
  } catch (error) {
    if (error instanceof mongoose.Error.DocumentNotFoundError) {
      throw new HttpError(
        409,
        "Biến thể đã được thay đổi hoặc không còn khả dụng. Vui lòng tải lại trước khi cập nhật.",
      );
    }
    if (error.code === 11000) {
      throw new HttpError(
        409,
        "Biến thể bị trùng SKU, tổ hợp màu hoặc biến thể mặc định đã tồn tại.",
      );
    }
    throw error;
  } finally {
    variant.$where = previousWhere;
  }
};
