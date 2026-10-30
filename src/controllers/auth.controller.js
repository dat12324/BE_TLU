import { authService } from "../services/auth.service.js";
import jwt from "jsonwebtoken";
import { HttpError } from "../utils/http-error.js";

const cookieOptions = (req) => ({
  httpOnly: true,
  secure: req.app.locals.authConfig.nodeEnv === "production",
  sameSite:
    req.app.locals.authConfig.nodeEnv === "production" ? "strict" : "lax",
  path: "/api/auth",
});
const checkOrigin = (req) => {
  if (
    (req.headers.origin &&
      req.headers.origin !== req.app.locals.authConfig.clientOrigin) ||
    req.headers["sec-fetch-site"] === "cross-site"
  ) {
    throw new HttpError(403, "Bạn không có quyền truy cập.");
  }
};
export const authController = {
  async register(req, res) {
    const {
      fullName,
      email,
      password,
      confirmPassword,
      phoneNumber,
      dateOfBirth,
    } = req.body;
    res
      .status(201)
      .json(
        await authService.register(
          fullName,
          email,
          password,
          confirmPassword,
          phoneNumber,
          dateOfBirth,
        ),
      );
  },
  async login(req, res) {
    const { email, password, remember } = req.body;
    const { refreshToken, ...result } = await authService.login(
      email,
      password,
      req.app.locals.authConfig,
    );
    if (refreshToken)
      res.cookie("refreshToken", refreshToken, {
        ...cookieOptions(req),
        ...(remember === false ? {} : {
          expires: new Date(jwt.decode(refreshToken).exp * 1000),
        }),
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
      await authService.refreshToken(
        cookie?.slice("refreshToken=".length),
        req.app.locals.authConfig,
      ),
    );
  },

  async verifyAccount(req, res) {
    const { email } = req.body ?? {};
    res
      .status(202)
      .json(await authService.verifyAccount(email, req.app.locals.authConfig));
  },
  async verifyEmail(req, res) {
    const { token, email } = req.query;
    res.json(await authService.verifyEmail(token, email));
  },
  async forgotPassword(req, res) {
    const { email } = req.body ?? {};
    res.status(202).json(await authService.forgotPassword(email));
  },
  async verifyCode(req, res) {
    const { email, otpCode } = req.body ?? {};
    res.json(await authService.verifyCode(email, otpCode));
  },
  async resetPassword(req, res) {
    const { email, newPassword, resetToken } = req.body ?? {};
    res.json(await authService.resetPassword(email, newPassword, resetToken));
  },
  async changePassword(req, res) {
    const { currentPassword, newPassword, confirmPassword } = req.body ?? {};
    const result = await authService.changePassword(
      req.user._id,
      currentPassword,
      newPassword,
      confirmPassword,
    );
    res.clearCookie("refreshToken", cookieOptions(req));
    res.json(result);
  },
  logout(req, res) {
    checkOrigin(req);
    res.clearCookie("refreshToken", cookieOptions(req));
    return res.status(200).json({ message: "Đăng xuất thành công" });
  },
};
