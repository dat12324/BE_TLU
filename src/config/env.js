import 'dotenv/config';

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
    throw new Error('MONGODB_URI is required and must start with mongodb:// or mongodb+srv://.');
  }

  const port = Number(env.PORT ?? 5000);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  const clientOrigin = env.CLIENT_ORIGIN ?? 'http://localhost:5173';
  let parsedOrigin;
  try { parsedOrigin = new URL(clientOrigin); } catch {
    throw new Error('CLIENT_ORIGIN must be a valid HTTP(S) origin.');
  }
  if (!['http:', 'https:'].includes(parsedOrigin.protocol) || parsedOrigin.origin !== clientOrigin) {
    throw new Error('CLIENT_ORIGIN must contain only an HTTP(S) origin, without a path or trailing slash.');
  }

  return {
    port,
    mongoUri,
    clientOrigin,
    nodeEnv: env.NODE_ENV ?? 'development',
    // Phần xác thực kiểm tra các giá trị này trước khi cấp/xác minh token; không ghi cấu hình vào nhật ký.
    jwtSecret: env.JWT_SECRET ?? '',
    jwtExpiresIn: env.JWT_EXPIRES_IN ?? '1d',
    // Chưa bắt buộc cho đến khi có yêu cầu thao tác với ảnh.
    cloudinary: readCloudinaryConfig(env),
  };
}
