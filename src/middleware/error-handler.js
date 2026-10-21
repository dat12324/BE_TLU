import { HttpError } from '../utils/http-error.js';

export function notFound(_req, res) {
  res.status(404).json({ message: 'Route not found' });
}

export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);
  const status = Number.isInteger(err.status) && err.status >= 400 && err.status <= 599
    ? err.status : 500;
  if (status >= 500) console.error('Request failed:', err.name ?? 'Error');
  const message = err instanceof HttpError ? err.message
    : status >= 500 ? 'Internal server error'
    : err.type === 'entity.parse.failed' ? 'Invalid JSON body'
    : err.type === 'entity.too.large' ? 'Request body too large'
    : 'Request could not be processed';
  res.status(status).json({ message });
}

