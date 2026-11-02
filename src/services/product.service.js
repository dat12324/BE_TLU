import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
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
  { sort = "newest", minPrice, maxPrice, ram, storage, color, inStock, isFeatured, isNew, isHotDeal } = {},
) => {
  ({ page, limit } = normalizePagination(page, limit));
  if (search) search = normalizeName(search);
  const filter = admin ? (status ? { status } : {}) : { status: "active" };
  for (const [field, value] of [["isFeatured", isFeatured], ["isNew", isNew]]) {
    if (value !== undefined) filter[`flags.${field}`] = String(value) === "true" ? true : { $ne: true };
  }
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
  // All SKU conditions belong to the same lookup, before Product pagination.
  const skuFilter = {
    status: "active", deletedAt: null,
    price: { $type: "number", $gte: 0, $lte: Number.MAX_SAFE_INTEGER, $mod: [1, 0] },
  };
  if (minPrice !== undefined) skuFilter.price.$gte = Number(minPrice);
  // Price ranges on the storefront use an exclusive upper bound.
  if (maxPrice !== undefined) skuFilter.price.$lt = Number(maxPrice);
  for (const [field, value] of [["ram", ram], ["storage", storage]]) {
    if (value === undefined) continue;
    const values = String(value).split(",").map(Number);
    // Read legacy imported GB/TB strings as well as current numeric GB values.
    skuFilter[field] = { $in: values.flatMap(number => [
      number, new RegExp(`^${number}\\s*(?:GB)?$`, "i"),
      ...(number % 1024 === 0 ? [new RegExp(`^${number / 1024}\\s*TB$`, "i")] : []),
    ]) };
  }
  if (color !== undefined) {
    skuFilter["color.name"] = {
      $regex: `^\\s*${normalizeName(color).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/ /g, "\\s+")}\\s*$`,
      $options: "i",
    };
  }
  const availableStock = { $cond: [
    { $and: [{ $isNumber: "$stock" }, { $isNumber: "$reservedStock" }] },
    { $cond: [
      { $and: [
        { $gte: ["$stock", 0] }, { $lte: ["$stock", Number.MAX_SAFE_INTEGER] },
        { $gte: ["$reservedStock", 0] }, { $lte: ["$reservedStock", "$stock"] },
        { $eq: [{ $mod: ["$stock", 1] }, 0] },
        { $eq: [{ $mod: ["$reservedStock", 1] }, 0] },
      ] },
      { $subtract: ["$stock", "$reservedStock"] }, null,
    ] }, null,
  ] };
  const stockFilter = inStock === undefined ? [] : [{ $match: {
    availableStock: String(inStock) === "true" ? { $gt: 0 } : 0,
  } }];
  const needsSku = [minPrice, maxPrice, ram, storage, color, inStock].some(value => value !== undefined);
  const ordering = sort === "price_asc" || sort === "price_desc"
    ? { hasPrice: -1, price: sort === "price_asc" ? 1 : -1, _id: -1 }
    : sort === "popular"
      ? { "flags.isFeatured": -1, reviewCount: -1, ratingAverage: -1, createdAt: -1, _id: -1 }
      : sort === "rating_desc"
        ? { ratingAverage: -1, createdAt: -1, _id: -1 }
      : { createdAt: -1, _id: -1 };
  const projection = Object.fromEntries((admin ? adminFields : publicFields).split(" ").filter(Boolean).map(field => [field, 1]));
  const [result] = await Product.aggregate([
    { $match: filter },
    { $lookup: {
      from: ProductVariant.collection.name, localField: "_id", foreignField: "product",
      pipeline: [
        { $match: skuFilter },
        { $set: { availableStock } },
        ...stockFilter,
        { $sort: { price: 1, _id: 1 } },
        { $project: {
          product: 1, sku: 1, ram: 1, storage: 1, "color.name": 1, "color.code": 1,
          "color.image.url": 1, price: 1, compareAtPrice: { $ifNull: ["$compareAtPrice", null] },
          isDefault: 1, status: 1, availableStock: 1,
        } },
      ], as: "skus",
    } },
    ...(needsSku ? [{ $match: { "skus.0": { $exists: true } } }] : []),
    { $set: {
      price: { $ifNull: [{ $arrayElemAt: ["$skus.price", 0] }, null] },
      compareAtPrice: { $ifNull: [{ $arrayElemAt: ["$skus.compareAtPrice", 0] }, null] },
      hasPrice: { $gt: [{ $size: "$skus" }, 0] },
    } },
    // Khuyến mãi: được đánh dấu hoặc có SKU hợp lệ đang giảm giá.
    ...(isHotDeal === undefined ? [] : [{ $match: { $expr: { $eq: [
      { $or: [
        { $eq: ["$flags.isHotDeal", true] },
        { $anyElementTrue: [{ $map: {
          input: "$skus", as: "sku", in: { $gt: ["$$sku.compareAtPrice", "$$sku.price"] },
        } }] },
      ] }, String(isHotDeal) === "true",
    ] } } }]),
    { $sort: ordering },
    { $facet: {
      data: [
        { $skip: (page - 1) * limit }, { $limit: limit },
        ...[["brand", Brand], ["category", Category]].flatMap(([field, Model]) => [
          { $lookup: {
            from: Model.collection.name, localField: field, foreignField: "_id",
            pipeline: [{ $project: { name: 1, slug: 1 } }], as: `${field}Info`,
          } },
          { $set: { [`${field}Info`]: { $arrayElemAt: [`$${field}Info`, 0] } } },
        ]),
        { $project: { ...projection, price: 1, compareAtPrice: 1, skus: 1, brandInfo: 1, categoryInfo: 1 } },
      ],
      count: [{ $count: "total" }],
    } },
  ]);
  const data = result?.data ?? [];
  const total = result?.count[0]?.total ?? 0;
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
