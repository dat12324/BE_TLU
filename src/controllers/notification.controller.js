import * as service from "../services/notification.service.js";

export const notificationController = {
  async list(req, res) {
    res.json(await service.listNotifications(req.user._id, req.query));
  },
  async unreadCount(req, res) {
    res.json({ data: { unreadCount: await service.countUnreadNotifications(req.user._id) } });
  },
  async read(req, res) {
    res.json({ data: await service.markNotificationRead(req.user._id, req.params.id) });
  },
  async readAll(req, res) {
    res.json({ data: await service.markAllNotificationsRead(req.user._id) });
  },
};
