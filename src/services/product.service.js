import Product from "../models/Product.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeName } from "../utils/text.js";
import slugify from "slugify";
import { normalizePagination } from "../utils/pagination.js";
const publicFields =
  "name slug brand category shortDescription description highlights images.url images.alt images.isPrimary " +
  "technicalSpecs specifications tags ratingAverage reviewCount flags status createdAt updatedAt";
const adminFields =
  "name slug brand category shortDescription description highlights images technicalSpecs " +
  "specifications tags ratingAverage reviewCount flags status createdBy updatedBy createdAt updatedAt";

const assertActiveReferences = async (product, session) => {
  const [brand, category] = await Promise.all([
    Brand.exists({ _id: product.brand, status: "active" }).session(session ?? null),
    Category.exists({ _id: product.category, status: "active" }).session(session ?? null),
  ]);
  if (!brand || !category)
    throw new HttpError(400, "Thương hiệu và danh mục phải tồn tại và đang hoạt động.");
};

const persistProduct = async (product, session) => {
  if (product.images?.filter((image) => image?.isPrimary).length > 1) {
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
    await assertActiveReferences(product, session);
  }
  try {
    return await product.save({ session });
  } catch (error) {
    if (error.code === 11000 &&
      (Object.hasOwn(error.keyPattern ?? {}, "slug") || Object.hasOwn(error.keyValue ?? {}, "slug")))
      throw new HttpError(409, "Đường dẫn sản phẩm đã tồn tại.");
    throw error;
  }
};

// Ảnh đầu vào là metadata từ CloudinaryStorage đã kiểm tra quyền, không phải buffer/file.
// Chưa có Review Model để tính lại điểm đánh giá.
// Các trường/ID đã qua Product Validator; adminId lấy từ User đã xác thực.
export const createProduct = async (
  name, slug, brand, category, shortDescription, description, highlights,
  images, technicalSpecs, specifications, tags, flags, status, adminId, session,
) => {
  if (slug === undefined && typeof name === "string") {
    slug = slugify(name, { lower: true, strict: true, locale: "vi", trim: true });
  }
  const input = Object.fromEntries(
    Object.entries({ name, slug, brand, category, shortDescription, description, highlights,
      images, technicalSpecs, specifications, tags, flags, status })
      .filter(([, value]) => value !== undefined),
  );
  const product = new Product({ createdBy: adminId, updatedBy: adminId });
  for (const field of Object.keys(input)) product.set(field, input[field]);
  return persistProduct(product, session);
};

export const updateProduct = async (
  productId,
  name, slug, brand, category, shortDescription, description, highlights,
  images, technicalSpecs, specifications, tags, flags, status, adminId, session, uploadedImages = [],
) => {
  if (name !== undefined && slug === undefined && typeof name === "string") {
    slug = slugify(name, { lower: true, strict: true, locale: "vi", trim: true });
  }
  const input = Object.fromEntries(
    Object.entries({ name, slug, brand, category, shortDescription, description, highlights,
      images, technicalSpecs, specifications, tags, flags, status })
      .filter(([, value]) => value !== undefined),
  );
  const product = await Product.findById(productId).session(session ?? null);
  if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm.");
  // Đổi trạng thái không sửa hoặc kiểm tra lại ảnh và dữ liệu import cũ.
  if (Object.keys(input).length === 1 && status !== undefined && !uploadedImages.length) {
    if (status === "active") await assertActiveReferences(product, session);
    const updated = await Product.findOneAndUpdate(
      { _id: product._id, brand: product.brand, category: product.category },
      { $set: { status, updatedBy: adminId }, $inc: { __v: 1 } },
      { returnDocument: "after", runValidators: true, session },
    );
    if (!updated) throw new HttpError(409, "Sản phẩm đã thay đổi. Vui lòng tải lại và thử lại.");
    return updated;
  }
  const previousImages = product.images.map(image => image.toObject());
  if (uploadedImages.length) {
    const retained = images ?? previousImages;
    input.images = [
      ...(uploadedImages.some(image => image.isPrimary)
        ? retained.map(image => ({ ...image, isPrimary: false })) : retained),
      ...uploadedImages,
    ];
  }
  if (input.images !== undefined) product.increment();
  // Chỉ chạy lại setter cho mảng đã sửa trực tiếp; mảng từ input chạy setter khi set bên dưới.
  for (const field of ["tags", "highlights"]) {
    if (!Object.hasOwn(input, field) && product.isModified(field) && Array.isArray(product[field]))
      product.set(field, [...product[field]]);
  }
  for (const field of Object.keys(input)) product.set(field, input[field]);
  product.updatedBy = adminId;
  return persistProduct(product, session);
};

// Query values have been type-checked by the request validator; never merge raw query objects.
export const listProducts = async (
  page = 1, limit = 20, search, brand, category, status, admin = false,
) => {
  ({ page, limit } = normalizePagination(page, limit));
  if (search) search = normalizeName(search);
  const filter = admin ? (status ? { status } : {}) : { status: "active" };
  for (const [field, value, Model] of [["brand", brand, Brand], ["category", category, Category]]) {
    if (value === undefined) continue;
    const reference = await Model.findOne({ slug: value.trim().toLowerCase() }).select("_id").lean();
    if (!reference) {
      return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    }
    filter[field] = reference._id;
  }
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
};

export const getProductDetail = async (value, isAdmin = false) => {
  const query = isAdmin ? { _id: value } : { slug: value, status: "active" };
  const product = await Product.findOne(query)
    .select(isAdmin ? adminFields : publicFields)
    .lean();
  if (!product) throw new HttpError(404, "Không tìm thấy sản phẩm.");
  return product;
};
