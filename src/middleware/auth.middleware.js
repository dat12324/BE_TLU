import jwt from "jsonwebtoken";
import mongoose from "mongoose";
import User from "../models/User.js";
import { HttpError } from "../utils/http-error.js";

// Reuse verified identity only when guards are stacked within this request.
const authenticatedUser = Symbol("authenticatedUser");

export const verifyToken = async (req, _res, next) => {
  if (req[authenticatedUser]) {
    req.user = req[authenticatedUser];
    return next();
  }
  try {
    const header = req.get("authorization");
    if (
      typeof header !== "string" ||
      header.length > 4096 ||
      !/^Bearer [^\s]+$/i.test(header)
    ) {
      throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
    }
    const config = req.app.locals.authConfig ?? {};
    if (
      typeof config.jwtSecret !== "string" ||
      Buffer.byteLength(config.jwtSecret, "utf8") < 32 ||
      typeof config.jwtExpiresIn !== "string" ||
      !/^[1-9]\d*(?:s|m|h|d)$/.test(config.jwtExpiresIn)
    ) {
      throw new HttpError(
        503,
        "Chưa cấu hình xác thực. Vui lòng kiểm tra JWT_SECRET và JWT_EXPIRES_IN.",
      );
    }
    let claims;
    try {
      claims = jwt.verify(header.slice(7), config.jwtSecret, {
        algorithms: ["HS256"],
        issuer: "tluphone-api",
        audience: "tluphone-web",
      });
      if (
        typeof claims !== "object" ||
        !claims ||
        !mongoose.isObjectIdOrHexString(claims.sub) ||
        !Number.isFinite(claims.exp) ||
        (claims.tokenVersion !== undefined &&
          (!Number.isSafeInteger(claims.tokenVersion) ||
            claims.tokenVersion < 0))
      ) {
        throw new Error("Thông tin trong token không hợp lệ.");
      }
    } catch {
      throw new HttpError(401, "Token truy cập không hợp lệ hoặc đã hết hạn.");
    }
    const user = await User.findById(claims.sub).select("+tokenVersion");
    if (!user || user.isActive !== true)
      throw new HttpError(401, "Vui lòng đăng nhập để tiếp tục.");
    if ((claims.tokenVersion ?? 0) !== (user.tokenVersion ?? 0)) {
      throw new HttpError(401, "Token truy cập không hợp lệ hoặc đã hết hạn.");
    }
    req[authenticatedUser] = user;
    req.user = user;
  } catch (error) {
    return next(error);
  }
  return next();
};

export const verifyTokenIfPresent = (req, res, next) => {
  if (req.get("authorization") === undefined) return next();
  return verifyToken(req, res, next);
};

export const verifyRole = (roles) => {
  if (
    !Array.isArray(roles) ||
    !roles.length ||
    roles.some((role) => !["user", "admin"].includes(role))
  ) {
    throw new TypeError(
      "verifyRole yêu cầu một mảng không rỗng gồm các vai trò user/admin.",
    );
  }
  return (req, res, next) =>
    verifyToken(req, res, (error) => {
      if (error) return next(error);
      if (!roles.includes(req.user.role)) {
        return next(
          new HttpError(
            403,
            roles.length === 1 && roles[0] === "admin"
              ? "Chức năng này yêu cầu quyền quản trị viên."
              : "Bạn không có quyền truy cập.",
          ),
        );
      }
      return next();
    });
};
