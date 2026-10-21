import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import Order from '../models/Order.js';
import Product from '../models/Product.js';
import ProductVariant from '../models/ProductVariant.js';
import { HttpError } from '../utils/http-error.js';

const isMoney = value => Number.isSafeInteger(value) && value >= 0;
const maxSafeAmount = BigInt(Number.MAX_SAFE_INTEGER);

function safeAmount(value, message) {
  if (value < 0n || value > maxSafeAmount) throw new HttpError(400, message);
  return Number(value);
}

// Chỉ chuẩn bị document; checkout sau này lưu cùng thao tác giữ hàng trong transaction.
// user, discountAmount và shippingFee do backend đã xác thực/tính toán cung cấp, không lấy từ req.body.
export async function prepareOrder(input, { user, discountAmount = 0, shippingFee = 0, session } = {}) {
  if (!mongoose.isObjectIdOrHexString(user)) throw new HttpError(400, 'Valid User is required.');
  if (!input || !Array.isArray(input.items) || input.items.length === 0) {
    throw new HttpError(400, 'Order must contain at least one valid item.');
  }
  if (!isMoney(discountAmount) || !isMoney(shippingFee)) {
    throw new HttpError(400, 'Amount must be a non-negative safe integer in VND.');
  }

  const ids = new Set();
  for (const item of input.items) {
    if (!item || !mongoose.isObjectIdOrHexString(item.productVariant)
      || !Number.isSafeInteger(item.quantity) || item.quantity <= 0) {
      throw new HttpError(400, 'Valid ProductVariant and positive safe integer quantity are required.');
    }
    const id = item.productVariant.toString().toLowerCase();
    if (ids.has(id)) throw new HttpError(400, 'Order items must reference distinct ProductVariants.');
    ids.add(id);
  }

  const variants = await ProductVariant.find({
    _id: { $in: [...ids] }, status: 'active', deletedAt: null,
  }).select('product sku ram storage color images price')
    .populate({ path: 'product', model: Product, select: 'name status images',
      options: { session } })
    .session(session ?? null).lean();
  const byId = new Map(variants.map(variant => [variant._id.toString(), variant]));
  const items = input.items.map(item => {
    const variant = byId.get(item.productVariant.toString().toLowerCase());
    if (!variant || variant.product?.status !== 'active') {
      throw new HttpError(409, 'Product or variant is unavailable.');
    }
    if (!isMoney(variant.price)) throw new HttpError(409, 'Product price is invalid.');
    const subtotal = safeAmount(BigInt(item.quantity) * BigInt(variant.price),
      'Item subtotal must equal quantity times unit price within the safe integer limit.');
    const imageUrl = variant.color?.image?.url ?? variant.images?.[0]?.url
      ?? variant.product.images?.find(image => image.isPrimary)?.url
      ?? variant.product.images?.[0]?.url;
    return {
      product: variant.product._id, productVariant: variant._id,
      productName: variant.product.name, sku: variant.sku, ram: variant.ram,
      storage: variant.storage, color: variant.color?.name, imageUrl,
      quantity: item.quantity, unitPrice: variant.price, subtotal,
    };
  });
  const subtotal = safeAmount(items.reduce((sum, item) => sum + BigInt(item.subtotal), 0n),
    'Order subtotal must equal the sum of item subtotals within the safe integer limit.');
  if (discountAmount > subtotal) throw new HttpError(400, 'Discount amount cannot exceed subtotal.');
  const totalAmount = safeAmount(BigInt(subtotal) - BigInt(discountAmount) + BigInt(shippingFee),
    'Total amount must equal subtotal minus discount plus shipping within the safe integer limit.');
  const address = input.shippingAddress;
  const order = new Order({
    orderCode: `TLU-${randomUUID()}`, user, items,
    shippingAddress: address == null ? undefined : {
      fullName: address.fullName, phone: address.phone, province: address.province,
      district: address.district, ward: address.ward, detailAddress: address.detailAddress,
    },
    subtotal, discountAmount, shippingFee, totalAmount,
    paymentMethod: input.paymentMethod, note: input.note,
  });
  await order.validate();
  return order;
}
