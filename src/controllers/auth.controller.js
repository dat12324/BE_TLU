import { toAuthUserDTO } from '../dto/user.dto.js';

export function createAuthController(authService) {
  return {
    async register(req, res) {
      res.status(201).json(await authService.register(req.validatedBody));
    },
    async login(req, res) {
      res.json(await authService.login(req.validatedBody));
    },
    me(req, res) {
      res.json({ user: toAuthUserDTO(req.user) });
    },
    logout(_req, res) {
      // JWT Bearer được giữ ở phía máy khách. Endpoint này không thu hồi token.
      res.json({ message: 'Remove the access token from the client. It remains valid until expiry.' });
    },
  };
}
