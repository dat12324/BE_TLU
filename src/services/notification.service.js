import Notification from "../models/Notifications.js";
import { normalizePagination } from "../utils/pagination.js";
import { HttpError } from "../utils/http-error.js";

export const listNotifications = async (user, query = {}) => {
  const { page, limit } = normalizePagination(query.page, query.limit);
  const [data, total] = await Promise.all([
    Notification.find({ user }).sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit).limit(limit).lean(),
    Notification.countDocuments({ user }),
  ]);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
};

export const countUnreadNotifications = async (user) =>
  Notification.countDocuments({ user, isRead: false });

export const markNotificationRead = async (user, id) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: id, user },
    { $set: { isRead: true } },
    { new: true, runValidators: true },
  ).lean();
  if (!notification) throw new HttpError(404, "Không tìm thấy thông báo.");
  return notification;
};

export const markAllNotificationsRead = async (user) => {
  const result = await Notification.updateMany(
    { user, isRead: false },
    { $set: { isRead: true } },
  );
  return { modifiedCount: result.modifiedCount };
};
