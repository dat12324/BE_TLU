import mongoose from "mongoose";
import slugify from "slugify";
import ProductVariant from "../models/ProductVariant.js";
import Product from "../models/Product.js";
import { normalizeName } from "../utils/text.js";
import { HttpError } from "../utils/http-error.js";
import { normalizePagination } from "../utils/pagination.js";
import { getInventoryStatus } from "../utils/inventory.js";

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

// Kiểm tra trước cho thao tác ghi danh mục của quản trị viên.
// Phép chiếu trực tiếp giữ nguyên dung lượng dạng chuỗi cũ (Mongoose sẽ ép kiểu chúng).
export const assertUniqueVariantCombination = async (variant, session) => {
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

const variantId = (id) => {
  if (!mongoose.isObjectIdOrHexString(id))
    throw new HttpError(400, "ID biến thể không hợp lệ.");
};

const customerFields =
  "product sku ram storage color.name color.code color.image.url price compareAtPrice stock reservedStock lowStockThreshold isDefault status";
const variantResponse = (document, admin) => {
  const data = document.toObject ? document.toObject() : { ...document };
  data.inventoryStatus = getInventoryStatus(data);
  data.availableStock = data.inventoryStatus === null
    ? null
    : data.stock - data.reservedStock;
  delete data.__v;
  delete data.images;
  if (!admin) {
    delete data.stock;
    delete data.reservedStock;
    delete data.lowStockThreshold;
  }
  return data;
};

export const listProductVariants = async (
  { page, limit, product, status, ram, storage, color } = {},
  admin = false,
) => {
  ({ page, limit } = normalizePagination(page, limit));
  const filter = { deletedAt: null };
  if (product) filter.product = product;
  if (status) filter.status = status;
  if (ram !== undefined) filter.ram = Number(ram);
  if (storage !== undefined) filter.storage = Number(storage);
  if (color) {
    const escaped = normalizeName(color).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    filter["color.name"] = new RegExp(`^${escaped}$`, "i");
  }
  if (!admin) {
    const products = await Product.find({
      status: "active",
      ...(product ? { _id: product } : {}),
    })
      .select("_id")
      .lean();
    filter.product = { $in: products.map((item) => item._id) };
    filter.status = "active";
  }
  const [documents, total] = await Promise.all([
    ProductVariant.find(filter)
      .select(admin ? "-__v" : customerFields)
      .sort({ isDefault: -1, createdAt: -1, _id: 1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean(),
    ProductVariant.countDocuments(filter),
  ]);
  return {
    data: documents.map((item) => variantResponse(item, admin)),
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
};

export const getProductVariant = async (id, admin = false) => {
  variantId(id);
  const variant = await ProductVariant.findOne({
    _id: id,
    deletedAt: null,
    ...(admin ? {} : { status: "active" }),
  })
    .select(admin ? "-__v" : customerFields)
    .lean();
  if (
    !variant ||
    (!admin &&
      !(await Product.exists({ _id: variant.product, status: "active" })))
  )
    throw new HttpError(404, "Không tìm thấy biến thể sản phẩm.");
  return variantResponse(variant, admin);
};

const generateSku = async (product, ram, storage, color, session) => {
  const parent = await Product.findById(product).select("name").session(session ?? null).lean();
  if (!parent) throw new HttpError(400, "Sản phẩm phải tồn tại.");
  const name = slugify(parent.name, { strict: true, locale: "vi", trim: true });
  const colorName = slugify(color?.name || "", { strict: true, locale: "vi", trim: true });
  const capacity = value => {
    const gb = capacityKey(value);
    return gb >= 1024 && gb % 1024 === 0 ? `${gb / 1024}TB` : `${gb ?? value}GB`;
  };
  return `${name || product}-${capacity(ram)}-${capacity(storage)}-${colorName}`.toUpperCase();
};

export const createProductVariant = async (
  { product, sku, ram, storage, color, price, compareAtPrice, stock, lowStockThreshold, isDefault, status },
  adminId,
  colorImage,
  session,
) => {
  if (sku === undefined) sku = await generateSku(product, ram, storage, color, session);
  if (colorImage) color = { ...color, image: colorImage };
  const variant = new ProductVariant({
    product,
    sku,
    ram,
    storage,
    color,
    price,
    compareAtPrice,
    stock,
    lowStockThreshold,
    isDefault,
    status,
    createdBy: adminId,
    updatedBy: adminId,
  });
  return saveProductVariant(variant, session);
};

export const createProductVariants = async (variants, adminId) =>
  mongoose.connection.transaction(async session => {
    const documents = [];
    // Ghi tuần tự để kiểm tra trùng cả các SKU vừa tạo trong transaction này.
    for (const variant of variants)
      documents.push(await createProductVariant(variant, adminId, undefined, session));
    return documents;
  });

export const updateProductVariant = async (
  id,
  { sku, ram, storage, color, price, compareAtPrice, lowStockThreshold, isDefault, status },
  adminId,
  colorImage,
) => {
  variantId(id);
  const variant = await ProductVariant.findOne({ _id: id, deletedAt: null });
  if (!variant) throw new HttpError(404, "Không tìm thấy biến thể sản phẩm.");
  if (colorImage) color = { ...color, image: colorImage };
  for (const [field, value] of Object.entries({
    sku,
    ram,
    storage,
    color,
    price,
    compareAtPrice,
    lowStockThreshold,
    isDefault,
    status,
  })) {
    if (value !== undefined) {
      // PATCH màu giữ code/image cũ nếu không gửi lại.
      if (field === "color") {
        for (const [key, entry] of Object.entries(value))
          variant.set(`color.${key}`, entry);
      } else variant.set(field, value);
    }
  }
  // Dung lượng không đổi về số (2048 GB = 2 TB) vẫn cần làm mới mã SKU cũ.
  if (ram !== undefined || storage !== undefined || color?.name !== undefined) {
    variant.sku = await generateSku(variant.product, variant.ram, variant.storage, variant.color);
  }
  variant.updatedBy = adminId;
  variant.$where = { deletedAt: null };
  variant.increment();
  return saveProductVariant(variant);
};

export const updateVariantStock = async (id, { stock, expectedStock }, adminId) => {
  variantId(id);
  // Giá trị cũ do Admin gửi giúp tránh ghi đè một lần nhập kho/checkout khác.
  const variant = await ProductVariant.findOneAndUpdate(
    {
      _id: id,
      deletedAt: null,
      stock: expectedStock,
      $expr: { $lte: ["$reservedStock", stock] },
    },
    { $set: { stock, updatedBy: adminId }, $inc: { __v: 1 } },
    { returnDocument: "after", runValidators: true },
  );
  if (!variant) {
    if (!(await ProductVariant.exists({ _id: id, deletedAt: null })))
      throw new HttpError(404, "Không tìm thấy biến thể sản phẩm.");
    throw new HttpError(
      409,
      "Tồn kho đã thay đổi hoặc thấp hơn số lượng đang giữ. Vui lòng tải lại.",
    );
  }
  return variantResponse(variant, true);
};

export const deleteProductVariant = async (id, adminId) => {
  variantId(id);
  const variant = await ProductVariant.findOneAndUpdate(
    { _id: id, deletedAt: null, reservedStock: 0 },
    {
      $set: {
        deletedAt: new Date(),
        status: "inactive",
        isDefault: false,
        updatedBy: adminId,
      },
      $inc: { __v: 1 },
    },
    { returnDocument: "after", runValidators: true },
  );
  if (!variant) {
    if (!(await ProductVariant.exists({ _id: id, deletedAt: null })))
      throw new HttpError(404, "Không tìm thấy biến thể sản phẩm.");
    throw new HttpError(
      409,
      "Không thể xóa biến thể đang có hàng được giữ cho đơn hàng.",
    );
  }
  return variantResponse(variant, true);
};

// Caller quản trị cung cấp document chỉ chứa các chỉnh sửa được cho phép.
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
  // Tồn kho hiện có được cập nhật riêng bằng updateVariantStock.
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
