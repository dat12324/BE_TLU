import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { chatController } from '../controllers/chat.controller.js';

const router = Router();
router.post('/messages', rateLimit({
  windowMs: 60_000, limit: 10,
  message: { message: 'Bạn gửi tin nhắn quá nhanh. Vui lòng thử lại sau một phút.' },
}), chatController.send);

export default router;
