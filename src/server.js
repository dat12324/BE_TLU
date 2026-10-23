import { createApp } from "./app.js";
import { loadConfig } from "./config/env.js";
import { connectDatabase, disconnectDatabase } from "./config/database.js";
import { connectRedis, disconnectRedis } from "./config/redis.js";

let server;
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
    const closed = await Promise.allSettled([
      disconnectRedis(),
      disconnectDatabase(),
    ]);
    if (closed.some((result) => result.status === "rejected"))
      throw new Error("Dừng máy chủ thất bại.");
    process.exitCode = exitCode;
  } catch {
    console.error("Không thể đóng máy chủ và các kết nối đúng cách.");
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

process.on("SIGINT", () => void shutdown());
process.on("SIGTERM", () => void shutdown());

try {
  const config = loadConfig();
  if (config.redisUrl) await connectRedis();
  await connectDatabase(config.mongoUri);
  if (shuttingDown) {
    await Promise.allSettled([disconnectRedis(), disconnectDatabase()]);
  } else {
    const app = createApp(config);
    await new Promise((resolve, reject) => {
      server = app.listen(config.port, resolve);
      server.once("error", reject);
    });
    console.log(`API TLUPhone đang chạy tại cổng ${config.port}`);
    server.on("error", () => {
      console.error("Máy chủ HTTP gặp lỗi.");
      void shutdown(1);
    });
  }
} catch (err) {
  // Lỗi MongoDB có thể chứa thông tin xác thực hoặc máy chủ; không ghi chúng vào nhật ký.
  const message =
    err.name === "MongooseServerSelectionError" ||
    err.name === "MongoParseError" ||
    err.name?.startsWith("Mongo")
      ? "Không thể kết nối MongoDB. Vui lòng kiểm tra MONGODB_URI và bảo đảm MongoDB đang hoạt động."
      : err.code === "EADDRINUSE"
        ? "Cổng PORT đang được sử dụng."
        : err.message;
  console.error(`Khởi động thất bại: ${message}`);
  await shutdown(1);
}
