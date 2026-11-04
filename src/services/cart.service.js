import Cart from "../models/Cart.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import { HttpError } from "../utils/http-error.js";

const availableStock = (sku) =>
  Number.isSafeInteger(sku?.stock) && Number.isSafeInteger(sku?.reservedStock) &&
  sku.stock >= 0 && sku.reservedStock >= 0 && sku.reservedStock <= sku.stock
    ? sku.stock - sku.reservedStock : null;

export const getCart = async (user) => {
  const cart = await Cart.findOne({ user }).lean();
  const savedItems = cart?.items ?? [];
  const variants = savedItems.length ? await ProductVariant.find({
    _id: { $in: savedItems.filter(Boolean).map(item => item.productVariant) },
    deletedAt: null,
  }).select("product sku ram storage color.name color.code color.image.url price status stock reservedStock")
    .populate({ path: "product", model: Product, select: "name slug images status" }).lean() : [];
  const byId = new Map(variants.map(sku => [String(sku._id), sku]));
  let totalQuantity = 0;
  let totalAmount = 0;
  const items = savedItems.filter(Boolean).map(item => {
    const sku = byId.get(String(item.productVariant));
    const stock = availableStock(sku);
    const validQuantity = Number.isSafeInteger(item.quantity) && item.quantity > 0;
    const subtotal = validQuantity && Number.isSafeInteger(sku?.price) && sku.price >= 0
      ? sku.price * item.quantity : null;
    totalQuantity += validQuantity ? item.quantity : 0;
    totalAmount += subtotal ?? 0;
    if ((subtotal !== null && !Number.isSafeInteger(subtotal)) ||
        !Number.isSafeInteger(totalAmount) || !Number.isSafeInteger(totalQuantity))
      throw new HttpError(409, "Giá hoặc số lượng trong giỏ hàng vượt giới hạn cho phép.");
    const { stock: ignoredStock, reservedStock, ...data } = sku ?? {};
    return {
      variantId: item.productVariant,
      productVariant: sku ? data : null,
      quantity: item.quantity,
      availableStock: stock,
      isAvailable: Boolean(validQuantity && subtotal !== null && sku?.status === "active" &&
        sku.product?.status === "active" && stock !== null && item.quantity <= stock),
      subtotal,
    };
  });
  return { items, totalQuantity, totalAmount };
};

const getAvailableSku = async (variantId, quantity) => {
  const sku = await ProductVariant.findOne({ _id: variantId, status: "active", deletedAt: null })
    .select("product stock reservedStock")
    .populate({ path: "product", model: Product, select: "status" }).lean();
  if (!sku || sku.product?.status !== "active")
    throw new HttpError(404, "Sản phẩm hoặc SKU hiện không khả dụng.");
  const stock = availableStock(sku);
  if (stock === null || quantity > stock)
    throw new HttpError(409, "Số lượng sản phẩm trong kho không đủ.");
  return { sku, stock };
};

export const addCartItem = async (user, variantId, quantity) => {
  const { sku, stock } = await getAvailableSku(variantId, quantity);
  // Unique user index handles simultaneous first-cart creation.
  try {
    await Cart.updateOne({ user }, { $setOnInsert: { user, items: [] } }, { upsert: true });
  } catch (error) {
    if (error.code !== 11000 || !(error.keyPattern?.user || error.keyValue?.user)) throw error;
  }
  const increment = () => Cart.updateOne({
    user, items: { $elemMatch: { productVariant: sku._id, quantity: { $gte: 1, $lte: stock - quantity } } },
  }, { $inc: { "items.$.quantity": quantity } });
  let result = await increment();
  if (!result.matchedCount) {
    result = await Cart.updateOne({ user, "items.productVariant": { $ne: sku._id } }, {
      $push: { items: { productVariant: sku._id, quantity } },
    }, { runValidators: true });
    // Another request may have inserted this SKU since the first increment.
    if (!result.matchedCount) result = await increment();
  }
  if (!result.matchedCount)
    throw new HttpError(409, "Số lượng trong giỏ hàng vượt tồn kho hoặc giỏ hàng đã thay đổi.");
  return getCart(user);
};

export const updateCartItem = async (user, variantId, quantity) => {
  const { sku } = await getAvailableSku(variantId, quantity);
  const result = await Cart.updateOne({ user, "items.productVariant": sku._id }, {
    $set: { "items.$.quantity": quantity },
  }, { runValidators: true });
  if (!result.matchedCount) throw new HttpError(404, "SKU không có trong giỏ hàng.");
  return getCart(user);
};

export const removeCartItem = async (user, variantId) => {
  await Cart.updateOne({ user }, { $pull: { items: { productVariant: variantId } } });
  return getCart(user);
};

export const clearCart = async (user) => {
  await Cart.updateOne({ user }, { $set: { items: [] } }, { runValidators: true });
  return getCart(user);
};
