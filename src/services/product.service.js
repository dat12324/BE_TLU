import mongoose from "mongoose";
import Product from "../models/Product.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeStringArray } from "../utils/text.js";
import { PRODUCT_EDITABLE_FIELDS } from "../validators/product.validator.js";
import { validateCatalogId } from "../validators/catalog.validator.js";

const editableFields = new Set(PRODUCT_EDITABLE_FIELDS);
const publicFields =
  "name slug brand category shortDescription description highlights images.url images.alt images.isPrimary " +
  "technicalSpecs specifications tags ratingAverage reviewCount flags status createdAt updatedAt";
const adminFields =
  "name slug brand category shortDescription description highlights images technicalSpecs " +
  "specifications tags ratingAverage reviewCount flags status createdBy updatedBy createdAt updatedAt";

function checkInput(input, adminId) {
  // Caller phải xác thực Admin trước khi gọi service; không lấy adminId từ request body.
  if (!mongoose.isObjectIdOrHexString(adminId))
    throw new HttpError(400, "Vui lòng cung cấp ID quản trị viên hợp lệ.");
  if (
    !input ||
    typeof input !== "object" ||
    Array.isArray(input) ||
    Object.keys(input).some((field) => !editableFields.has(field))
  ) {
    throw new HttpError(
      400,
      "Dữ liệu sản phẩm chứa trường không được hỗ trợ hoặc không được phép chỉnh sửa.",
    );
  }
}

async function persistProduct(product, session) {
  // Bao gồm push()/sửa phần tử trực tiếp trên document trước khi lưu qua service.
  if (product.isModified("tags")) {
    const tags = normalizeStringArray(product.tags, true);
    product.tags = Array.isArray(tags) ? [...new Set(tags)] : tags;
  }
  if (product.isModified("highlights")) {
    product.highlights = normalizeStringArray(product.highlights);
  }
  await product.validate();
  if (product.images.filter((image) => image.isPrimary).length > 1) {
    throw new HttpError(400, "Mỗi sản phẩm chỉ được có tối đa một ảnh chính.");
  }
  if (product.reviewCount === 0 && product.ratingAverage !== 0) {
    throw new HttpError(400, "Điểm đánh giá phải bằng 0 khi chưa có đánh giá.");
  }
  // Allow hiding a product even if its existing Brand/Category has been deactivated.
  if (
    product.isNew ||
    product.status === "active" ||
    product.isModified("brand") ||
    product.isModified("category")
  ) {
    const brand = await Brand.exists({
      _id: product.brand,
      status: "active",
    }).session(session ?? null);
    const category = await Category.exists({
      _id: product.category,
      status: "active",
    }).session(session ?? null);
    if (!brand || !category)
      throw new HttpError(
        400,
        "Thương hiệu và danh mục phải tồn tại và đang hoạt động.",
      );
  }
  try {
    return await product.save({ session });
  } catch (error) {
    if (error.code === 11000)
      throw new HttpError(409, "Đường dẫn sản phẩm đã tồn tại.");
    throw error;
  }
}

// Ảnh đầu vào phải là metadata từ Image Service đã kiểm tra quyền, không phải buffer/file.
// Service không tự upload/xóa ảnh. Chưa có Review Model để tính lại điểm đánh giá.
export async function createProduct(input, { adminId, session } = {}) {
  checkInput(input, adminId);
  const product = new Product({ createdBy: adminId, updatedBy: adminId });
  for (const field of Object.keys(input)) product.set(field, input[field]);
  return persistProduct(product, session);
}

export async function updateProduct(
  productId,
  input,
  { adminId, session } = {},
) {
  checkInput(input, adminId);
  if (!mongoose.isObjectIdOrHexString(productId))
    throw new HttpError(400, "Vui lòng cung cấp ID sản phẩm hợp lệ.");
  const product = await Product.findById(productId).session(session ?? null);
  if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm.");
  for (const field of Object.keys(input)) product.set(field, input[field]);
  product.updatedBy = adminId;
  return persistProduct(product, session);
}

// Query values have been type-checked by the request validator; never merge raw query objects.
export async function listProducts(
  { page = 1, limit = 20, search, brand, category, status } = {},
  { admin = false } = {},
) {
  const filter = admin ? (status ? { status } : {}) : { status: "active" };
  if (brand) filter.brand = brand;
  if (category) filter.category = category;
  if (search)
    filter.name = {
      $regex: search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
      $options: "i",
    };
  const [data, total] = await Promise.all([
    Product.find(filter)
      .select(admin ? adminFields : publicFields)
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    Product.countDocuments(filter),
  ]);
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}

export async function getProduct(id) {
  validateCatalogId(id, "Product");
  const product = await Product.findById(id).select(adminFields).lean();
  if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm.");
  return product;
}

export async function getPublicProduct(slug) {
  const product = await Product.findOne({ slug, status: "active" })
    .select(publicFields)
    .lean();
  if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm.");
  return product;
}
