import { createApp } from './app.js';
import { loadConfig } from './config/env.js';
import { connectDatabase, disconnectDatabase } from './config/database.js';

let server;
let shuttingDown = false;

async function shutdown(exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  const deadline = setTimeout(() => process.exit(1), 10000);
  deadline.unref();
  try {
    if (server?.listening) {
      await new Promise((resolve, reject) => server.close(err => err ? reject(err) : resolve()));
    }
    await disconnectDatabase();
    process.exitCode = exitCode;
  } catch {
    console.error('Failed to shut down cleanly.');
    process.exitCode = 1;
  } finally {
    clearTimeout(deadline);
  }
}

process.on('SIGINT', () => void shutdown());
process.on('SIGTERM', () => void shutdown());

try {
  const config = loadConfig();
  await connectDatabase(config.mongoUri);
  if (shuttingDown) {
    await disconnectDatabase();
  } else {
    const app = createApp(config);
    await new Promise((resolve, reject) => {
      server = app.listen(config.port, resolve);
      server.once('error', reject);
    });
    console.log(`TLUPhone API listening on port ${config.port}`);
    server.on('error', () => {
      console.error('HTTP server error.');
      void shutdown(1);
    });
  }
} catch (err) {
  // Lỗi MongoDB có thể chứa thông tin xác thực hoặc máy chủ; không ghi chúng vào nhật ký.
  const message = err.name === 'MongooseServerSelectionError' || err.name === 'MongoParseError'
    || err.name?.startsWith('Mongo')
    ? 'Unable to connect to MongoDB. Check MONGODB_URI and ensure MongoDB is running.'
    : err.code === 'EADDRINUSE' ? 'PORT is already in use.'
    : err.message;
  console.error(`Startup failed: ${message}`);
  await shutdown(1);
}
