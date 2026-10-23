import "dotenv/config";

export function readCloudinaryConfig(env = process.env) {
  return {
    cloud_name: env.CLOUDINARY_CLOUD_NAME?.trim(),
    api_key: env.CLOUDINARY_API_KEY?.trim(),
    api_secret: env.CLOUDINARY_API_SECRET?.trim(),
    secure: true,
  };
}

export function loadConfig(env = process.env) {
  const mongoUri = env.MONGODB_URI?.trim();
  if (!mongoUri || !/^mongodb(?:\+srv)?:\/\/.+/.test(mongoUri)) {
    throw new Error(
      "MONGODB_URI là bắt buộc và phải bắt đầu bằng mongodb:// hoặc mongodb+srv://.",
    );
  }

  const port = Number(env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT phải là số nguyên từ 1 đến 65535.");
  }

  const clientOrigin = env.CLIENT_ORIGIN ?? "http://localhost:5173";
  let parsedOrigin;
  try {
    parsedOrigin = new URL(clientOrigin);
  } catch {
    throw new Error("CLIENT_ORIGIN phải là origin HTTP(S) hợp lệ.");
  }
  if (
    !["http:", "https:"].includes(parsedOrigin.protocol) ||
    parsedOrigin.origin !== clientOrigin
  ) {
    throw new Error(
      "CLIENT_ORIGIN chỉ được chứa origin HTTP(S), không có đường dẫn hoặc dấu gạch chéo ở cuối.",
    );
  }

  return {
    port,
    mongoUri,
    clientOrigin,
    nodeEnv: env.NODE_ENV ?? "development",
    // Phần xác thực kiểm tra các giá trị này trước khi cấp/xác minh token; không ghi cấu hình vào nhật ký.
    jwtSecret: env.JWT_SECRET ?? "",
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? "1d",
    passwordResetSecret: env.PASSWORD_RESET_SECRET ?? "",
    redisUrl: env.REDIS_URL?.trim() ?? "",
    jwtRefreshSecret: env.JWT_REFRESH_SECRET ?? "",
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN ?? "7d",
    apiBaseUrl: env.API_BASE_URL?.trim() ?? `http://localhost:${port}`,
    smtp: {
      host: env.SMTP_HOST?.trim(),
      port: Number(env.SMTP_PORT ?? 587),
      secure: env.SMTP_SECURE ?? "false",
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
      from: env.SMTP_FROM?.trim(),
    },
    // Chưa bắt buộc cho đến khi có yêu cầu thao tác với ảnh.
    cloudinary: readCloudinaryConfig(env),
  };
}
