import { getDashboard } from "../services/dashboard.service.js";

export const dashboardController = async (req, res) => {
  res.json({ data: await getDashboard(req.query.period) });
};
