import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import Brand from "../models/Brand.js";
import Category from "../models/Category.js";
import { HttpError } from "../utils/http-error.js";
import { normalizeName, normalizeColorName, normalizeStringArray } from "../utils/text.js";
import slugify from "slugify";
import { normalizePagination } from "../utils/pagination.js";

const publicFields =
  "name slug brand category shortDescription description highlights images.url images.alt images.isPrimary " +
  "technicalSpecs specifications tags ratingAverage reviewCount flags status createdAt updatedAt";

const adminFields =
  "name slug brand category shortDescription description highlights images technicalSpecs " +
  "specifications tags ratingAverage reviewCount flags status createdBy updatedBy createdAt updatedAt";

// Kiểm tra thương hiệu và danh mục
const assertActiveReferences = async (product, session) => {
  const [brand, category] = await Promise.all([
    Brand.exists({ _id: product.brand, status: "active" }).session(
      session ?? null,
    ),
    Category.exists({ _id: product.category, status: "active" }).session(
      session ?? null,
    ),
  ]);

  if (!brand || !category) {
    throw new HttpError(
      400,
      "Thương hiệu và danh mục phải tồn tại và đang hoạt động.",
    );
  }
};

// Lưu sản phẩm
const persistProduct = async (product, session) => {
  if (product.images?.filter((image) => image?.isPrimary).length > 1) {
    throw new HttpError(400, "Mỗi sản phẩm chỉ được có tối đa một ảnh chính.");
  }

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
    if (
      error.code === 11000 &&
      (Object.hasOwn(error.keyPattern ?? {}, "slug") ||
        Object.hasOwn(error.keyValue ?? {}, "slug"))
    ) {
      throw new HttpError(409, "Đường dẫn sản phẩm đã tồn tại.");
    }

    throw error;
  }
};

// Tạo sản phẩm
export const createProduct = async (
  name,
  slug,
  brand,
  category,
  shortDescription,
  description,
  highlights,
  images,
  technicalSpecs,
  specifications,
  tags,
  flags,
  status,
  adminId,
  session,
) => {
  if (slug === undefined && typeof name === "string") {
    slug = slugify(name, {
      lower: true,
      strict: true,
      locale: "vi",
      trim: true,
    });
  }

  const input = Object.fromEntries(
    Object.entries({
      name,
      slug,
      brand,
      category,
      shortDescription,
      description,
      highlights,
      images,
      technicalSpecs,
      specifications,
      tags,
      flags,
      status,
    }).filter(([, value]) => value !== undefined),
  );

  const product = new Product({
    createdBy: adminId,
    updatedBy: adminId,
  });

  for (const field of Object.keys(input)) {
    product.set(field, input[field]);
  }

  return persistProduct(product, session);
};

// Cập nhật sản phẩm
export const updateProduct = async (
  productId,
  name,
  slug,
  brand,
  category,
  shortDescription,
  description,
  highlights,
  images,
  technicalSpecs,
  specifications,
  tags,
  flags,
  status,
  adminId,
  session,
  uploadedImages = [],
) => {
  if (name !== undefined && slug === undefined && typeof name === "string") {
    slug = slugify(name, {
      lower: true,
      strict: true,
      locale: "vi",
      trim: true,
    });
  }

  const input = Object.fromEntries(
    Object.entries({
      name,
      slug,
      brand,
      category,
      shortDescription,
      description,
      highlights,
      images,
      technicalSpecs,
      specifications,
      tags,
      flags,
      status,
    }).filter(([, value]) => value !== undefined),
  );

  const product = await Product.findById(productId).session(session ?? null);

  if (!product) {
    throw new HttpError(404, "Không tìm thấy sản phẩm.");
  }

  // Cập nhật riêng trạng thái
  if (
    Object.keys(input).length === 1 &&
    status !== undefined &&
    !uploadedImages.length
  ) {
    if (status === "active") {
      await assertActiveReferences(product, session);
    }

    const updated = await Product.findOneAndUpdate(
      { _id: product._id, brand: product.brand, category: product.category },
      { $set: { status, updatedBy: adminId }, $inc: { __v: 1 } },
      { returnDocument: "after", runValidators: true, session },
    );

    if (!updated) {
      throw new HttpError(
        409,
        "Sản phẩm đã thay đổi. Vui lòng tải lại và thử lại.",
      );
    }

    return updated;
  }

  const previousImages = product.images.map((image) => image.toObject());

  if (uploadedImages.length) {
    const retained = images ?? previousImages;

    input.images = [
      ...(uploadedImages.some((image) => image.isPrimary)
        ? retained.map((image) => ({ ...image, isPrimary: false }))
        : retained),
      ...uploadedImages,
    ];
  }

  if (input.images !== undefined) {
    product.increment();
  }

  for (const field of ["tags", "highlights"]) {
    if (
      !Object.hasOwn(input, field) &&
      product.isModified(field) &&
      Array.isArray(product[field])
    ) {
      product.set(field, [...product[field]]);
    }
  }

  for (const field of Object.keys(input)) {
    product.set(field, input[field]);
  }

  product.updatedBy = adminId;

  return persistProduct(product, session);
};

// Danh sách sản phẩm: lọc/phân trang tại MongoDB, không tải toàn bộ SKU về Node.
export const listProducts = async (
  page = 1, limit = 20, search, brand, category, status, admin = false,
  { sort = "newest", minPrice, maxPrice, ram, storage, color, inStock,
    isFeatured, isNew, isHotDeal, tags } = {},
) => {
  ({ page, limit } = normalizePagination(page, limit));
  const filter = admin ? (status ? { status } : {}) : { status: "active" };
  if (sort === "battery_desc") {
    filter["technicalSpecs.batteryCapacity"] = { $type: "number", $gt: 0 };
  }
  if (tags !== undefined) {
    if (typeof tags !== "string") throw new HttpError(400, "Tags phải là chuỗi, phân cách bằng dấu phẩy.");
    const selectedTags = [...new Set(normalizeStringArray(tags.split(","), true))];
    if (selectedTags.length) filter.tags = { $all: selectedTags };
  }
  for (const [field, value] of [["isFeatured", isFeatured], ["isNew", isNew]]) {
    if (value !== undefined) filter[`flags.${field}`] = String(value) === "true" ? true : { $ne: true };
  }
  for (const [field, value, Model] of [["brand", brand, Brand], ["category", category, Category]]) {
    if (value === undefined) continue;
    const reference = await Model.findOne({ slug: value.trim().toLowerCase() }).select("_id").lean();
    if (!reference) return { data: [], pagination: { page, limit, total: 0, totalPages: 0 } };
    filter[field] = reference._id;
  }
  if (search) filter.name = { $regex: normalizeName(search).replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };

  const skuFilter = {
    status: "active", deletedAt: null,
    price: { $type: "number", $gte: 0, $lte: Number.MAX_SAFE_INTEGER, $mod: [1, 0] },
  };
  if (minPrice !== undefined) skuFilter.price.$gte = Math.max(0, Number(minPrice));
  if (maxPrice !== undefined) skuFilter.price.$lt = Number(maxPrice);
  // Dữ liệu import cũ có thể là chuỗi GB/TB; API vẫn trả nguyên giá trị lưu trong SKU.
  for (const [field, value] of [["ram", ram], ["storage", storage]]) {
    if (value === undefined) continue;
    skuFilter[field] = { $in: String(value).split(",").map(Number).flatMap(number => [
      number,
      ...(Number.isSafeInteger(number) && number > 0 ? [new RegExp(`^\\s*0*${number}\\s*(?:GB)?\\s*$`, "i")] : []),
      ...(number > 0 && number % 1024 === 0 ? [new RegExp(`^\\s*0*${number / 1024}\\s*TB\\s*$`, "i")] : []),
    ]) };
  }
  if (color !== undefined) {
    const escaped = normalizeColorName(color).replace(/[.*+?^${}()|[\]\\]/g, "\\$&").split(" ").join("\\s+");
    skuFilter["color.name"] = { $regex: `^\\s*(?:${escaped}|${escaped.normalize("NFD")})\\s*$`, $options: "i" };
  }
  const validStock = ["stock", "reservedStock"].map(field => ({
    $cond: [{ $isNumber: `$${field}` }, { $and: [
      { $gte: [`$${field}`, 0] }, { $lte: [`$${field}`, Number.MAX_SAFE_INTEGER] },
      { $eq: [{ $mod: [`$${field}`, 1] }, 0] },
    ] }, false],
  }));
  // Hết hàng khi có SKU đang bán và tất cả đều có tồn khả dụng bằng 0.
  // Đọc riêng tồn kho để bộ lọc giá/RAM/màu không che mất SKU còn hàng.
  const soldOut = admin && String(inStock) === "false";
  const inventoryStages = soldOut ? [
    { $lookup: {
      from: ProductVariant.collection.name, localField: "_id", foreignField: "product", as: "inventorySkus",
      pipeline: [
        { $match: { status: "active", deletedAt: null } },
        { $project: { _id: 0, availableStock: { $cond: [
          { $and: [...validStock, { $lte: ["$reservedStock", "$stock"] }] },
          { $subtract: ["$stock", "$reservedStock"] }, null,
        ] } } },
      ],
    } },
    { $match: { $expr: { $and: [
      { $gt: [{ $size: "$inventorySkus" }, 0] },
      { $allElementsTrue: [{ $map: { input: "$inventorySkus", as: "sku", in: { $eq: ["$$sku.availableStock", 0] } } }] },
    ] } } },
  ] : [];
  const skuStages = [
    { $match: skuFilter },
    { $set: { availableStock: { $cond: [
      { $and: [...validStock, { $lte: ["$reservedStock", "$stock"] }] },
      { $subtract: ["$stock", "$reservedStock"] }, null,
    ] } } },
    ...(inStock === undefined || soldOut ? [] : [{ $match: { availableStock: String(inStock) === "true" ? { $gt: 0 } : 0 } }]),
    { $sort: { price: 1, _id: 1 } },
    { $project: {
      product: 1, sku: 1, ram: 1, storage: 1, price: 1, isDefault: 1, status: 1,
      "color.name": 1, "color.code": 1, "color.image.url": 1, availableStock: 1,
      compareAtPrice: { $ifNull: ["$compareAtPrice", null] },
    } },
  ];
  const enrich = [
    { $lookup: { from: ProductVariant.collection.name, localField: "_id", foreignField: "product", pipeline: skuStages, as: "skus" } },
    { $set: {
      price: { $ifNull: [{ $arrayElemAt: ["$skus.price", 0] }, null] },
      compareAtPrice: { $ifNull: [{ $arrayElemAt: ["$skus.compareAtPrice", 0] }, null] },
      hasPrice: { $gt: [{ $size: "$skus" }, 0] },
    } },
  ];
  const needsSku = [minPrice, maxPrice, ram, storage, color, inStock].some(value => value !== undefined);
  const skuConditions = [
    ...(needsSku ? [{ $match: { hasPrice: true } }] : []),
    ...(isHotDeal === undefined ? [] : [
      { $set: { hotDeal: { $or: [
        { $eq: ["$flags.isHotDeal", true] },
        { $anyElementTrue: [{ $map: { input: "$skus", as: "sku", in: { $gt: ["$$sku.compareAtPrice", "$$sku.price"] } } }] },
      ] } } },
      { $match: { hotDeal: String(isHotDeal) === "true" } },
    ]),
  ];
  const orderBy = ["price_asc", "price_desc"].includes(sort)
    ? { hasPrice: -1, price: sort === "price_asc" ? 1 : -1, createdAt: -1, _id: -1 }
    : sort === "discount_desc" ? { discountRate: -1, createdAt: -1, _id: -1 }
    : sort === "battery_desc" ? { "technicalSpecs.batteryCapacity": -1, _id: -1 }
    : sort === "rating_desc" ? { ratingAverage: -1, createdAt: -1, _id: -1 }
    : sort === "popular" ? { "flags.isFeatured": -1, reviewCount: -1, ratingAverage: -1, createdAt: -1, _id: -1 }
    : { createdAt: -1, _id: -1 };
  const paginationStages = [
    ...(sort === "discount_desc" ? [{ $set: { discountRate: { $cond: [
      { $and: [{ $gt: ["$compareAtPrice", 0] }, { $gte: ["$price", 0] }, { $gt: ["$compareAtPrice", "$price"] }] },
      { $divide: [{ $subtract: ["$compareAtPrice", "$price"] }, "$compareAtPrice"] }, 0,
    ] } } }] : []),
    { $sort: orderBy }, { $skip: (page - 1) * limit }, { $limit: limit }];
  const referenceStages = [
    ...[["brand", Brand], ["category", Category]].map(([field, Model]) => ({ $lookup: {
      from: Model.collection.name, localField: field, foreignField: "_id",
      pipeline: [{ $project: { name: 1, slug: 1 } }], as: `${field}Info`,
    } })),
    { $set: {
      brandInfo: { $ifNull: [{ $arrayElemAt: ["$brandInfo", 0] }, null] },
      categoryInfo: { $ifNull: [{ $arrayElemAt: ["$categoryInfo", 0] }, null] },
    } },
    { $set: { brand: { $ifNull: ["$brandInfo._id", null] }, category: { $ifNull: ["$categoryInfo._id", null] } } },
    { $project: { ...Object.fromEntries((admin ? adminFields : publicFields)
      .split(" ")
      .filter(field => field && !["description", "specifications"].includes(field))
      .map(field => [field, 1])),
      brandInfo: 1, categoryInfo: 1, price: 1, compareAtPrice: 1, skus: 1 } },
  ];
  // Không lọc/sắp theo SKU: cắt trang trước lookup để Home chỉ đọc SKU cần hiển thị.
  const paginateFirst = !needsSku && isHotDeal === undefined && !["price_asc", "price_desc", "discount_desc"].includes(sort);
  const [result] = await Product.aggregate([
    { $match: filter },
    ...inventoryStages,
    ...(paginateFirst ? [] : [...enrich, ...skuConditions]),
    { $facet: {
      total: [{ $count: "value" }],
      data: [...paginationStages, ...(paginateFirst ? enrich : []), ...referenceStages],
    } },
  ]);
  const total = result?.total[0]?.value ?? 0;
  const data = (result?.data ?? []).map(product => ({
    ...product,
    skus: product.skus.map(sku => ({
      ...sku,
      color: sku.color && { ...sku.color, image: { url: sku.color.image?.url } },
    })),
  }));
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

// Chi tiết sản phẩm
export const getProductDetail = async (value, isAdmin = false) => {
  const query = isAdmin ? { _id: value } : { slug: value, status: "active" };

  const product = await Product.findOne(query)
    .select(isAdmin ? adminFields : publicFields)
    .lean();

  if (!product) {
    throw new HttpError(404, "Không tìm thấy sản phẩm.");
  }

  return product;
};
