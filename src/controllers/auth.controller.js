import { toAuthUserDTO } from "../dto/user.dto.js";
import jwt from "jsonwebtoken";
import { HttpError } from "../utils/http-error.js";

export function createAuthController(authService, config = {}) {
  const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === "production",
    sameSite: config.nodeEnv === "production" ? "strict" : "lax",
    path: "/api/auth",
  };
  function checkOrigin(req) {
    if (
      (req.headers.origin && req.headers.origin !== config.clientOrigin) ||
      req.headers["sec-fetch-site"] === "cross-site"
    ) {
      throw new HttpError(403, "Bạn không có quyền truy cập.");
    }
  }
  return {
    async register(req, res) {
      res.status(201).json(await authService.register(req.validatedBody));
    },
    async login(req, res) {
      const { refreshToken, ...result } = await authService.login(
        req.validatedBody,
      );
      if (refreshToken)
        res.cookie("refreshToken", refreshToken, {
          ...cookieOptions,
          expires: new Date(jwt.decode(refreshToken).exp * 1000),
        });
      res.json(result);
    },
    async refreshToken(req, res) {
      checkOrigin(req);
      const cookie = req.headers.cookie
        ?.split(";")
        .map((value) => value.trim())
        .find((value) => value.startsWith("refreshToken="));
      res.json(
        await authService.refreshToken(cookie?.slice("refreshToken=".length)),
      );
    },
    async verifyAccount(req, res) {
      res.status(202).json(await authService.verifyAccount(req.validatedBody));
    },
    async verifyEmail(req, res) {
      res.json(await authService.verifyEmail(req.validatedQuery));
    },
    async forgotPassword(req, res) {
      res.status(202).json(await authService.forgotPassword(req.validatedBody));
    },
    async verifyCode(req, res) {
      res.json(await authService.verifyCode(req.validatedBody));
    },
    async resetPassword(req, res) {
      res.json(await authService.resetPassword(req.validatedBody));
    },
    me(req, res) {
      res.json({ user: toAuthUserDTO(req.user) });
    },
    logout(req, res) {
      checkOrigin(req);
      res.clearCookie("refreshToken", cookieOptions);
      // JWT Bearer được giữ ở phía máy khách. Endpoint này không thu hồi token.
      res.json({
        message:
          "Vui lòng xóa token truy cập trên thiết bị. Token vẫn có hiệu lực cho đến khi hết hạn.",
      });
    },
  };
}
