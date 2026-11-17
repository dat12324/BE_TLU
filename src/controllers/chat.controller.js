import { sendChatMessage } from '../services/chat.service.js';

export const chatController = {
  async send(req, res) {
    res.json(await sendChatMessage(req.body?.message, req.body?.history));
  },
};
