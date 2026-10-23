import { WatchError } from "redis";
import redisClient from "../config/redis.js";
import { HttpError } from "./http-error.js";

class CacheRepository {
  async run(operation) {
    try {
      if (!redisClient.isReady) throw new Error();
      return await operation();
    } catch {
      throw new HttpError(
        503,
        "Bộ nhớ đệm xác thực hiện không khả dụng. Vui lòng thử lại sau.",
      );
    }
  }

  async set(key, value, ttl) {
    if (ttl !== undefined && (!Number.isSafeInteger(ttl) || ttl <= 0))
      throw new TypeError("Thời hạn lưu bộ nhớ đệm không hợp lệ.");
    return this.run(() =>
      redisClient.set(
        key,
        JSON.stringify(value),
        ttl === undefined ? {} : { EX: ttl },
      ),
    );
  }

  async get(key) {
    return this.run(() => redisClient.get(key));
  }
  async delete(key) {
    return this.run(() => redisClient.del(key));
  }

  // WATCH thuộc từng kết nối: không dùng kết nối chung cho request đồng thời.
  // Khi key thay đổi trước EXEC, đọc lại và thử lại; lỗi Redis khác trả 503.
  async transaction(keys, operation) {
    return this.run(async () => {
      const client = redisClient.duplicate({
        socket: { reconnectStrategy: false, connectTimeout: 5000 },
      });
      client.on("error", () => {});
      try {
        await client.connect();
        for (let attempt = 0; attempt < 32; attempt++) {
          await client.watch(keys);
          try {
            return await operation(client);
          } catch (error) {
            if (!(error instanceof WatchError)) throw error;
          }
        }
        throw new Error();
      } finally {
        if (client.isOpen) await client.close();
      }
    });
  }
}

export default new CacheRepository();
