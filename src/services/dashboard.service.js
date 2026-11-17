
import Order from "../models/Order.js";
import Product from "../models/Product.js";
import ProductVariant from "../models/ProductVariant.js";
import User from "../models/User.js";

const periods = {
  today: "Hôm nay",
  "7days": "7 ngày gần nhất",
  "30days": "30 ngày gần nhất",
  month: "Tháng này",
};

const statuses = {
  pending: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  shipping: "Đang giao hàng",
  delivered: "Đã giao",
  cancelled: "Đã hủy",
};

const day = 86400000;
const offset = 7 * 3600000;

const getDateKey = (date) => {
  return new Date(new Date(date).getTime() + offset)
    .toISOString()
    .slice(0, 10);
};

const getDateRange = (period, now) => {
  const today = getDateKey(now);
  const end = new Date(`${today}T00:00:00+07:00`);

  end.setTime(end.getTime() + day);

  let start;

  if (period === "month") {
    start = new Date(`${today.slice(0, 7)}-01T00:00:00+07:00`);
  } else {
    const days = {
      today: 1,
      "7days": 7,
      "30days": 30,
    };

    start = new Date(end.getTime() - days[period] * day);
  }

  return { start, end };
};

export const getDashboard = async (period = "7days", now = new Date()) => {
  if (!Object.hasOwn(periods, period)) {
    period = "7days";
  }

  const { start, end } = getDateRange(period, now);
  const range = { $gte: start, $lt: end };

  // Lấy dữ liệu
  const [
    orders,
    paidOrders,
    recentOrdersData,
    variants,
    activeProductCount,
    customerCount,
  ] = await Promise.all([
    Order.find({ createdAt: range })
      .select("status")
      .lean(),

    Order.find({
      status: "delivered",
      paymentStatus: "paid",
      deliveredAt: range,
    })
      .select("deliveredAt totalAmount items")
      .lean(),

    Order.find({ createdAt: range })
      .sort({ createdAt: -1, _id: -1 })
      .limit(5)
      .select("orderCode shippingAddress createdAt totalAmount status")
      .lean(),

    ProductVariant.find({
      status: "active",
      deletedAt: null,
      stock: { $type: "number" },
    })
      .populate({
        path: "product",
        match: { status: "active" },
        select: "name images",
      })
      .select("product sku stock reservedStock lowStockThreshold color")
      .lean(),

    Product.countDocuments({ status: "active" }),
    User.countDocuments({ role: "user" }),
  ]);

  // Thống kê trạng thái đơn hàng
  const orderStatuses = Object.entries(statuses).map(([status, label]) => ({
    status,
    label,
    count: orders.filter((order) => order.status === status).length,
  }));

  // Thống kê doanh thu theo ngày
  const revenueMap = new Map();

  for (const order of paidOrders) {
    const date = getDateKey(order.deliveredAt);
    const currentRevenue = revenueMap.get(date) || 0;

    revenueMap.set(date, currentRevenue + order.totalAmount);
  }

  const revenueSeries = [];
  let totalRevenue = 0;

  for (let time = start.getTime(); time < end.getTime(); time += day) {
    const date = getDateKey(time);
    const revenue = revenueMap.get(date) || 0;

    totalRevenue += revenue;

    revenueSeries.push({
      date,
      label: `${date.slice(8)}/${date.slice(5, 7)}`,
      revenue,
    });
  }

  // 5 đơn hàng gần nhất
  const recentOrders = recentOrdersData.map((order) => ({
    _id: order._id,
    id: order._id,
    code: order.orderCode,
    customerName: order.shippingAddress?.fullName,
    createdAt: order.createdAt,
    total: order.totalAmount,
    status: order.status,
    statusLabel: statuses[order.status] || order.status,
  }));

  // Thống kê sản phẩm bán chạy
  const productMap = new Map();

  for (const order of paidOrders) {
    for (const item of order.items || []) {
      const productId = String(item.product);

      if (!productMap.has(productId)) {
        productMap.set(productId, {
          _id: item.product,
          id: item.product,
          name: item.productName,
          image: item.imageUrl,
          quantity: 0,
          revenue: 0,
        });
      }

      const product = productMap.get(productId);

      product.quantity += item.quantity;
      product.revenue += item.subtotal;
    }
  }

  const topProducts = [...productMap.values()]
    .sort((a, b) => {
      if (b.quantity !== a.quantity) {
        return b.quantity - a.quantity;
      }

      if (b.revenue !== a.revenue) {
        return b.revenue - a.revenue;
      }

      return String(a._id).localeCompare(String(b._id));
    })
    .slice(0, 5)
    .map((product) => ({
      ...product,
      image: product.image || "/images/products/placeholder.svg",
    }));

  // Sản phẩm sắp hết hàng
  const lowStockProducts = variants
    .filter((variant) => {
      if (!variant.product) return false;

      const availableStock = variant.stock - (variant.reservedStock ?? 0);

      return availableStock < variant.lowStockThreshold;
    })
    .map((variant) => ({
      _id: variant._id,
      id: variant._id,
      productName: variant.product.name,
      image:
        variant.color?.image?.url ||
        variant.product.images?.[0]?.url ||
        "/images/products/placeholder.svg",
      sku: variant.sku,
      label: variant.sku,
      stock: variant.stock - (variant.reservedStock ?? 0),
    }))
    .sort((a, b) => {
      if (a.stock !== b.stock) {
        return a.stock - b.stock;
      }

      return String(a._id).localeCompare(String(b._id));
    })
    .slice(0, 10);

  return {
    meta: {
      period,
      periodLabel: periods[period],
      rangeStart: start,
      rangeEnd: end,
      referenceDate: now,
    },

    summary: {
      revenue: totalRevenue,
      orderCount: orders.length,
      activeProductCount,
      customerCount,
    },

    revenueSeries,
    orderStatuses,
    recentOrders,
    topProducts,
    lowStockProducts,
  };
};
