import mongoose from 'mongoose';
import * as models from '../models/index.js';

export async function connectDatabase(uri) {
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
  try {
    await Promise.all(Object.entries(models).map(async ([name, model]) => {
      try { await model.init(); } catch (error) {
        const code = Number.isInteger(error.code) ? ` (code ${error.code})` : '';
        throw new Error(`Database index initialization failed for ${name}${code}. Check duplicate data and existing index definitions.`);
      }
    }));
  } catch (error) {
    throw error;
  }
}

export async function disconnectDatabase() {
  await mongoose.disconnect();
}

export function isDatabaseConnected() {
  return mongoose.connection.readyState === 1;
}
