import { updateAvatar } from "../services/user.service.js";

export async function updateMyAvatar(req, res) {
  res.json(await updateAvatar(req.user._id, req.file.buffer));
}
