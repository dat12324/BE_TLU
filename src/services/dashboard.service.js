import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import User from "../models/User.js";

const periods = { today: "Hôm nay", "7days": "7 ngày gần nhất", "30days": "30 ngày gần nhất", month: "Tháng này" };
const statuses = { pending: "Chờ xác nhận", confirmed: "Đã xác nhận", shipping: "Đang giao hàng", delivered: "Đã giao", cancelled: "Đã hủy" };
const day = 86400000;
const offset = 7 * 3600000;
const dateKey = date => new Date(Number(date) + offset).toISOString().slice(0, 10);

export const getDashboard = async (period = "7days", now = new Date()) => {
  if (!Object.hasOwn(periods, period)) period = "7days";
  const today = dateKey(now);
  const end = new Date(`${today}T00:00:00+07:00`);
  end.setTime(end.getTime() + day);
  const start = new Date(period === "month" ? `${today.slice(0, 7)}-01T00:00:00+07:00` : end.getTime() - day * ({ today: 1, "7days": 7, "30days": 30 }[period]));
  const range = { $gte: start, $lt: end };
  const paid = { status: "delivered", paymentStatus: "paid", deliveredAt: range };
  const [orders, revenue, topProducts, lowStockProducts, activeProductCount, customerCount] = await Promise.all([
    Order.aggregate([
      { $match: { createdAt: range } },
      { $facet: {
        statuses: [{ $group: { _id: "$status", count: { $sum: 1 } } }],
        recent: [{ $sort: { createdAt: -1, _id: -1 } }, { $limit: 5 }, { $project: { code: "$orderCode", customerName: "$shippingAddress.fullName", createdAt: 1, total: "$totalAmount", status: 1 } }],
      } },
    ]),
    Order.aggregate([
      { $match: paid },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$deliveredAt", timezone: "+07:00" } }, revenue: { $sum: "$totalAmount" } } },
    ]),
    Order.aggregate([
      { $match: paid }, { $unwind: "$items" },
      { $group: { _id: "$items.product", name: { $first: "$items.productName" }, image: { $first: "$items.imageUrl" }, quantity: { $sum: "$items.quantity" }, revenue: { $sum: "$items.subtotal" } } },
      { $sort: { quantity: -1, revenue: -1, _id: 1 } }, { $limit: 5 },
    ]),
    ProductVariant.aggregate([
      { $match: { status: "active", deletedAt: null, stock: { $type: "number" } } },
      { $set: { availableStock: { $subtract: ["$stock", { $ifNull: ["$reservedStock", 0] }] } } },
      { $match: { $expr: { $lt: ["$availableStock", "$lowStockThreshold"] } } },
      { $lookup: { from: Product.collection.name, localField: "product", foreignField: "_id", pipeline: [{ $match: { status: "active" } }, { $project: { name: 1, images: 1 } }], as: "product" } },
      { $unwind: "$product" }, { $sort: { availableStock: 1, _id: 1 } }, { $limit: 10 },
      { $project: { productName: "$product.name", image: { $ifNull: ["$color.image.url", { $arrayElemAt: ["$product.images.url", 0] }] }, sku: 1, stock: "$availableStock" } },
    ]),
    Product.countDocuments({ status: "active" }),
    User.countDocuments({ role: "user" }),
  ]);
  const counts = new Map((orders[0]?.statuses || []).map(item => [item._id, item.count]));
  const dailyRevenue = new Map(revenue.map(item => [item._id, item.revenue]));
  const revenueSeries = [];
  for (let time = start.getTime(); time < end.getTime(); time += day) {
    const date = dateKey(time);
    revenueSeries.push({ date, label: `${date.slice(8)}/${date.slice(5, 7)}`, revenue: dailyRevenue.get(date) || 0 });
  }
  const image = value => value || "/images/products/placeholder.svg";
  return {
    meta: { period, periodLabel: periods[period], rangeStart: start, rangeEnd: end, referenceDate: now },
    summary: { revenue: revenueSeries.reduce((sum, item) => sum + item.revenue, 0), orderCount: [...counts.values()].reduce((sum, count) => sum + count, 0), activeProductCount, customerCount },
    revenueSeries,
    orderStatuses: Object.entries(statuses).map(([status, label]) => ({ status, label, count: counts.get(status) || 0 })),
    recentOrders: (orders[0]?.recent || []).map(item => ({ ...item, id: item._id, statusLabel: statuses[item.status] || item.status })),
    topProducts: topProducts.map(item => ({ ...item, id: item._id, image: image(item.image) })),
    lowStockProducts: lowStockProducts.map(item => ({ ...item, id: item._id, image: image(item.image), label: item.sku })),
  };
};
