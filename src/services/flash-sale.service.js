import FlashSale from "../models/FlashSale.js";
import ProductVariant from "../models/ProductVariant.js";
import Product from "../models/Product.js";
import { HttpError } from "../utils/http-error.js";

const activeFilter = (now = new Date()) => ({
  isEnabled: true,
  startAt: { $lte: now },
  endAt: { $gt: now },
});
const offerPrice = (item, price) =>
  Number.isInteger(item.discountPercent) &&
  item.discountPercent >= 1 &&
  item.discountPercent <= 99
    ? Math.round(price * (1 - item.discountPercent / 100))
    : null;

const flashSaleStatus = (sale, now = new Date()) => {
  if (!sale.isEnabled) return "disabled";
  if (sale.startAt > now) return "upcoming";
  return sale.endAt <= now ? "ended" : "active";
};

const enrichSale = async (sale, admin) => {
  const status = flashSaleStatus(sale);
  const variants =
    sale.items.length && (admin || status === "active")
      ? await ProductVariant.find({
          _id: { $in: sale.items.map((item) => item.productVariant) },
          deletedAt: null,
          ...(admin ? {} : { status: "active" }),
        })
          .select(
            "product sku ram storage color price compareAtPrice stock reservedStock status",
          )
          .populate({
            path: "product",
            model: Product,
            select:
              "name slug images status brand category shortDescription ratingAverage reviewCount",
          })
          .lean()
      : [];
  const byId = new Map(variants.map((sku) => [String(sku._id), sku]));
  const items = sale.items.flatMap((item) => {
    const sku = byId.get(String(item.productVariant));
    if (!sku)
      return admin
        ? [
            {
              productVariant: item.productVariant,
              discountPercent: item.discountPercent,
              sku: null,
            },
          ]
        : [];
    const salePrice = offerPrice(item, sku.price);
    const availableStock =
      Number.isSafeInteger(sku.stock) && Number.isSafeInteger(sku.reservedStock)
        ? Math.max(0, sku.stock - sku.reservedStock)
        : null;
    if (
      !admin &&
      (sku.product?.status !== "active" ||
        !availableStock ||
        salePrice === null ||
        salePrice >= sku.price)
    )
      return [];
    const { stock, reservedStock, ...data } = sku;
    return [
      {
        productVariant: item.productVariant,
        discountPercent: item.discountPercent,
        salePrice,
        sku: {
          ...data,
          availableStock,
          ...(!admin
            ? {
                price: salePrice,
                compareAtPrice: sku.compareAtPrice ?? sku.price,
                flashSaleId: sale._id,
                flashSaleEndsAt: sale.endAt,
              }
            : {}),
          color: sku.color
            ? {
                name: sku.color.name,
                code: sku.color.code,
                image: sku.color.image
                  ? { url: sku.color.image.url }
                  : undefined,
              }
            : undefined,
        },
      },
    ];
  });
  return {
    _id: sale._id,
    name: sale.name,
    startAt: sale.startAt,
    endAt: sale.endAt,
    isEnabled: sale.isEnabled,
    createdAt: sale.createdAt,
    updatedAt: sale.updatedAt,
    items,
    computedStatus: status,
  };
};

export const getFlashSale = async (admin = false) => {
  const sale = await FlashSale.findOne();
  return sale ? enrichSale(sale.toObject(), admin) : null;
};

export const saveFlashSale = async (input) => {
  const sale = await FlashSale.findOne();
  if (!sale) throw new HttpError(404, "Chưa có cấu hình Flash Sale.");
  for (const field of ["name", "startAt", "endAt", "isEnabled"])
    if (input[field] !== undefined) sale.set(field, input[field]);
  if (input.items !== undefined)
    sale.set(
      "items",
      input.items.map(({ productVariant, discountPercent }) => ({
        productVariant,
        discountPercent,
      })),
    );
  await sale.validate();
  if (sale.endAt <= sale.startAt)
    throw new HttpError(400, "Thời gian kết thúc phải sau thời gian bắt đầu.");
  if (
    (sale.isEnabled && !sale.items.length) ||
    sale.items.some((item) => !item) ||
    new Set(sale.items.map((item) => String(item.productVariant))).size !==
      sale.items.length
  )
    throw new HttpError(
      400,
      "Flash Sale đang bật cần ít nhất một SKU và không được lặp SKU.",
    );
  if (sale.isEnabled) {
    const variants = await ProductVariant.find({
      _id: { $in: sale.items.map((item) => item.productVariant) },
      status: "active",
      deletedAt: null,
    })
      .select("product price")
      .populate({ path: "product", model: Product, select: "status" })
      .lean();
    const byId = new Map(variants.map((sku) => [String(sku._id), sku]));
    for (const item of sale.items) {
      const sku = byId.get(String(item.productVariant));
      if (!sku || sku.product?.status !== "active")
        throw new HttpError(400, "SKU và sản phẩm phải tồn tại, đang bán.");
      const price = offerPrice(item, sku.price);
      if (
        !Number.isSafeInteger(sku.price) ||
        price === null ||
        price < 0 ||
        price >= sku.price
      )
        throw new HttpError(
          400,
          "Giá Flash Sale phải thấp hơn giá bán hiện tại của SKU.",
        );
    }
  }
  await sale.save();
  return enrichSale(sale.toObject(), true);
};

export const flashSalePriceStages = (now = new Date()) => [
  {
    $lookup: {
      from: FlashSale.collection.name,
      localField: "_id",
      foreignField: "items.productVariant",
      let: { skuId: "$_id", basePrice: "$price" },
      pipeline: [
        { $match: activeFilter(now) },
        { $unwind: "$items" },
        {
          $match: {
            "items.discountPercent": {
              $type: "number",
              $gte: 1,
              $lte: 99,
              $mod: [1, 0],
            },
            $expr: { $eq: ["$items.productVariant", "$$skuId"] },
          },
        },
        // $round dùng ties-to-even; floor(x + 0.5) khớp Math.round với giá không âm.
        {
          $set: {
            computedPrice: {
              $floor: {
                $add: [
                  {
                    $multiply: ["$$basePrice",{$subtract: [1,{ $divide: ["$items.discountPercent", 100] },],},],
                  },
                  0.5,
                ],
              },
            },
          },
        },
        {
          $match: {
            $expr: {
              $and: [
                { $isNumber: "$computedPrice" },
                { $gte: ["$computedPrice", 0] },
                { $lt: ["$computedPrice", "$$basePrice"] },
              ],
            },
          },
        },
        { $limit: 1 },
        {
          $project: {
            price: "$computedPrice",
            endAt: 1,
          },
        },
      ],
      as: "flashOffer",
    },
  },
  {
    $set: {
      compareAtPrice: {
        $cond: [
          { $gt: [{ $size: "$flashOffer" }, 0] },
          { $ifNull: ["$compareAtPrice", "$price"] },
          { $ifNull: ["$compareAtPrice", null] },
        ],
      },
      price: {
        $ifNull: [{ $arrayElemAt: ["$flashOffer.price", 0] }, "$price"],
      },
      flashSaleId: { $arrayElemAt: ["$flashOffer._id", 0] },
      flashSaleEndsAt: { $arrayElemAt: ["$flashOffer.endAt", 0] },
    },
  },
];

export const applyFlashSalePrices = async (variants, session) => {
  if (!variants.length) return variants;
  const sale = await FlashSale.findOne(activeFilter())
    .select("items endAt")
    .session(session ?? null)
    .lean();
  if (!sale) return variants;
  const offers = new Map(
    sale.items.map((item) => [String(item.productVariant), item]),
  );
  return variants.map((sku) => {
    const item = offers.get(String(sku._id));
    const price = item ? offerPrice(item, sku.price) : null;
    return price !== null && price >= 0 && price < sku.price
      ? {
          ...sku,
          price,
          compareAtPrice: sku.compareAtPrice ?? sku.price,
          flashSaleId: sale._id,
          flashSaleEndsAt: sale.endAt,
        }
      : sku;
  });
};
