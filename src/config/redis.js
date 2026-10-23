import { createClient } from "redis";
import "dotenv/config";

let redisClient;
try {
  redisClient = createClient({
    url: process.env.REDIS_URL,
    disableOfflineQueue: true,
    socket: {
      connectTimeout: 5000,
      keepAlive: 5000,
      reconnectStrategy: (retries) =>
        retries < 3 ? 250 * (retries + 1) : false,
    },
  });
} catch {
  throw new Error("Cấu hình REDIS_URL không hợp lệ.");
}

redisClient.on("error", () => {
  console.error("Kết nối Redis gặp lỗi.");
});

redisClient.on("ready", () => {
  console.log("Redis đã sẵn sàng!");
});

export async function connectRedis() {
  if (!process.env.REDIS_URL || !/^rediss?:\/\//.test(process.env.REDIS_URL)) {
    throw new Error("REDIS_URL phải bắt đầu bằng redis:// hoặc rediss://.");
  }
  if (!redisClient.isOpen) {
    try {
      await redisClient.connect();
    } catch {
      throw new Error("Không thể kết nối Redis. Vui lòng kiểm tra REDIS_URL.");
    }
  }
}

export async function disconnectRedis() {
  if (redisClient.isOpen) await redisClient.close();
}

export default redisClient;
