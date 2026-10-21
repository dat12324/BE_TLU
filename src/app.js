import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { isDatabaseConnected } from './config/database.js';
import { createApiRouter } from './routes/index.js';
import { errorHandler, notFound } from './middleware/error-handler.js';

export function createApp(config, { databaseConnected = isDatabaseConnected } = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.use(helmet());
  app.use(cors({ origin: config.clientOrigin }));
  if (config.nodeEnv !== 'test') app.use(morgan(config.nodeEnv === 'production' ? 'combined' : 'dev'));
  app.use(express.json({ limit: '1mb' }));
  app.use('/api', createApiRouter(databaseConnected, config));
  app.use(notFound);
  app.use(errorHandler);
  return app;
}
