import { HttpError } from '../utils/http-error.js';

export function createAuthenticate(authService) {
  return async (req, _res, next) => {
    try {
      const header = req.get('authorization');
      if (typeof header !== 'string' || header.length > 4096 || !/^Bearer [^\s]+$/i.test(header)) {
        throw new HttpError(401, 'Authentication required.');
      }
      req.user = await authService.authenticate(header.slice(7));
      next();
    } catch (error) { next(error); }
  };
}

export function requireAdmin(req, _res, next) {
  if (!req.user) return next(new HttpError(401, 'Authentication required.'));
  if (req.user.isActive !== true || req.user.role !== 'admin') {
    return next(new HttpError(403, 'Admin access required.'));
  }
  next();
}
