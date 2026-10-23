import { HttpError } from "../utils/http-error.js";
import { normalizeName } from "../utils/text.js";
import {
  BCRYPT_HASH_PATTERN,
  EMAIL_PATTERN,
  PHONE_PATTERN,
} from "../utils/validation-patterns.js";

function requireBody(body, allowed) {
  if (
    !body ||
    typeof body !== "object" ||
    Array.isArray(body) ||
    Object.keys(body).some((key) => !allowed.includes(key))
  ) {
    throw new HttpError(400, "Các trường dữ liệu gửi lên không hợp lệ.");
  }
}

function emailValue(value) {
  if (
    typeof value !== "string" ||
    value.length > 254 ||
    !EMAIL_PATTERN.test(value.trim())
  ) {
    throw new HttpError(400, "Vui lòng nhập địa chỉ email hợp lệ.");
  }
  return value.trim().toLowerCase();
}

function passwordValue(value, registering = false) {
  if (
    typeof value !== "string" ||
    !value.length ||
    Buffer.byteLength(value, "utf8") > 72 ||
    (registering &&
      (value.length < 8 || !value.trim() || BCRYPT_HASH_PATTERN.test(value)))
  ) {
    throw new HttpError(
      400,
      registering
        ? "Mật khẩu phải có ít nhất 8 ký tự và tối đa 72 byte UTF-8."
        : "Vui lòng nhập mật khẩu hợp lệ.",
    );
  }
  return value;
}

function parseRegister(body) {
  requireBody(body, [
    "fullName",
    "email",
    "phoneNumber",
    "dateOfBirth",
    "password",
    "confirmPassword",
  ]);
  const fullName = normalizeName(body.fullName);
  if (typeof fullName !== "string" || !fullName || fullName.length > 200) {
    throw new HttpError(
      400,
      "Họ tên là bắt buộc và không được vượt quá 200 ký tự.",
    );
  }
  const email = emailValue(body.email);
  const password = passwordValue(body.password, true);
  if (body.confirmPassword !== password)
    throw new HttpError(400, "Mật khẩu xác nhận không khớp.");
  const result = { fullName, email, password };
  // Số điện thoại và ngày sinh vẫn không bắt buộc, nhất quán với mô hình User.
  if (body.phoneNumber !== undefined && body.phoneNumber !== "") {
    if (
      typeof body.phoneNumber !== "string" ||
      !PHONE_PATTERN.test(body.phoneNumber.trim())
    ) {
      throw new HttpError(400, "Số điện thoại không hợp lệ.");
    }
    result.phoneNumber = body.phoneNumber.trim();
  }
  if (body.dateOfBirth !== undefined && body.dateOfBirth !== "") {
    const value = body.dateOfBirth;
    const date =
      typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)
        ? new Date(value)
        : new Date(NaN);
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value ||
      date > new Date()
    ) {
      throw new HttpError(
        400,
        "Ngày sinh phải hợp lệ, có định dạng YYYY-MM-DD và không được ở tương lai.",
      );
    }
    result.dateOfBirth = date;
  }
  return result;
}

function parseLogin(body) {
  requireBody(body, ["email", "password"]);
  return {
    email: emailValue(body.email),
    password: passwordValue(body.password),
  };
}

function checkParamsAndQuery(req) {
  if (
    Object.keys(req.params ?? {}).length ||
    Object.keys(req.query ?? {}).length
  ) {
    throw new HttpError(
      400,
      "API xác thực không nhận tham số đường dẫn hoặc tham số truy vấn.",
    );
  }
}

export function validateRegister(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    req.validatedBody = parseRegister(req.body);
    next();
  } catch (error) {
    next(error);
  }
}

export function validateLogin(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    req.validatedBody = parseLogin(req.body);
    next();
  } catch (error) {
    next(error);
  }
}

export function validateEmptyAuthRequest(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    if (
      req.body !== undefined &&
      (!req.body ||
        typeof req.body !== "object" ||
        Array.isArray(req.body) ||
        Object.keys(req.body).length)
    ) {
      throw new HttpError(
        400,
        "API xác thực này không nhận các trường dữ liệu trong nội dung yêu cầu.",
      );
    }
    next();
  } catch (error) {
    next(error);
  }
}

export function validateForgotPassword(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    requireBody(req.body, ["email"]);
    req.validatedBody = { email: emailValue(req.body.email) };
    next();
  } catch (error) {
    next(error);
  }
}

export function validateVerifyCode(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    const field = req.path === "/verifyCode" ? "otpCode" : "otp";
    requireBody(req.body, ["email", field]);
    const email = emailValue(req.body.email);
    if (
      typeof req.body[field] !== "string" ||
      !/^\d{5}$/.test(req.body[field])
    ) {
      throw new HttpError(400, "Mã xác thực phải gồm đúng 5 chữ số.");
    }
    req.validatedBody = { email, otp: req.body[field] };
    next();
  } catch (error) {
    next(error);
  }
}

export function validateResetPassword(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    const bdsRequest = req.path === "/resetPassword";
    requireBody(
      req.body,
      bdsRequest
        ? ["email", "resetToken", "newPassword"]
        : ["email", "resetToken", "password", "confirmPassword"],
    );
    const email = emailValue(req.body.email);
    const password = passwordValue(
      bdsRequest ? req.body.newPassword : req.body.password,
      true,
    );
    if (!bdsRequest && req.body.confirmPassword !== password)
      throw new HttpError(400, "Mật khẩu xác nhận không khớp.");
    if (
      typeof req.body.resetToken !== "string" ||
      !/^[A-Za-z0-9_-]{43}$/.test(req.body.resetToken)
    ) {
      throw new HttpError(
        400,
        "Token đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.",
      );
    }
    req.validatedBody = { email, resetToken: req.body.resetToken, password };
    next();
  } catch (error) {
    next(error);
  }
}

export function validateVerifyEmail(req, _res, next) {
  try {
    if (
      Object.keys(req.params ?? {}).length ||
      Object.keys(req.query ?? {}).some(
        (key) => !["email", "token"].includes(key),
      ) ||
      (req.body !== undefined &&
        (!req.body ||
          typeof req.body !== "object" ||
          Object.keys(req.body).length))
    ) {
      throw new HttpError(400, "Các trường dữ liệu gửi lên không hợp lệ.");
    }
    const email = emailValue(req.query?.email);
    const token = req.query?.token;
    if (
      typeof token !== "string" ||
      !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(
        token,
      )
    ) {
      throw new HttpError(
        400,
        "Liên kết xác thực email không hợp lệ hoặc đã hết hạn.",
      );
    }
    req.validatedQuery = { email, token };
    next();
  } catch (error) {
    next(error);
  }
}
