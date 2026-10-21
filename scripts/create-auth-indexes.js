import mongoose from 'mongoose';
import { loadConfig } from '../src/config/env.js';
import { isUniqueEmailIndex } from '../src/utils/auth-index.js';

// Lệnh do người vận hành chủ động chạy; không thực thi khi khởi động, import hoặc đăng ký.
try {
  await mongoose.connect(loadConfig().mongoUri, { autoIndex: false, autoCreate: false, serverSelectionTimeoutMS: 10000 });
  const users = mongoose.connection.db.collection('users');
  let indexes;
  try { indexes = await users.listIndexes().toArray(); } catch (error) {
    if (error.code !== 26) throw error;
    indexes = [];
  }
  if (!indexes.some(isUniqueEmailIndex)) await users.createIndex({ email: 1 }, { unique: true });
  console.log('Unique User email index is ready.');
} catch (error) {
  console.error(error.code === 11000
    ? 'Cannot create email index: duplicate emails exist. No records were changed.'
    : 'Cannot create email index. Check database access and existing index definitions.');
  console.error('Error type:', error.name, 'code:', error.code ?? 'unavailable');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
