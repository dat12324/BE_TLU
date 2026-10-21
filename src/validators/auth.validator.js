import { HttpError } from '../utils/http-error.js';
import { normalizeName } from '../utils/text.js';
import { BCRYPT_HASH_PATTERN, EMAIL_PATTERN, PHONE_PATTERN } from '../utils/validation-patterns.js';

function requireBody(body, allowed) {
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || Object.keys(body).some(key => !allowed.includes(key))) {
    throw new HttpError(400, 'Invalid request fields.');
  }
}

function emailValue(value) {
  if (typeof value !== 'string' || value.length > 254 || !EMAIL_PATTERN.test(value.trim())) {
    throw new HttpError(400, 'A valid email is required.');
  }
  return value.trim().toLowerCase();
}

function passwordValue(value, registering = false) {
  if (typeof value !== 'string' || !value.length || Buffer.byteLength(value, 'utf8') > 72
    || (registering && (value.length < 8 || !value.trim() || BCRYPT_HASH_PATTERN.test(value)))) {
    throw new HttpError(400, registering
      ? 'Password must contain at least 8 characters and at most 72 UTF-8 bytes.'
      : 'A valid password is required.');
  }
  return value;
}

function parseRegister(body) {
  requireBody(body, ['fullName', 'email', 'phoneNumber', 'dateOfBirth', 'password', 'confirmPassword']);
  const fullName = normalizeName(body.fullName);
  if (typeof fullName !== 'string' || !fullName || fullName.length > 200) {
    throw new HttpError(400, 'Full name is required and must not exceed 200 characters.');
  }
  const email = emailValue(body.email);
  const password = passwordValue(body.password, true);
  if (body.confirmPassword !== password) throw new HttpError(400, 'Passwords do not match.');
  const result = { fullName, email, password };
  // Số điện thoại và ngày sinh vẫn không bắt buộc, nhất quán với mô hình User.
  if (body.phoneNumber !== undefined && body.phoneNumber !== '') {
    if (typeof body.phoneNumber !== 'string' || !PHONE_PATTERN.test(body.phoneNumber.trim())) {
      throw new HttpError(400, 'Invalid phone number.');
    }
    result.phoneNumber = body.phoneNumber.trim();
  }
  if (body.dateOfBirth !== undefined && body.dateOfBirth !== '') {
    const value = body.dateOfBirth;
    const date = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(value) : new Date(NaN);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || date > new Date()) {
      throw new HttpError(400, 'Date of birth must be a valid non-future YYYY-MM-DD date.');
    }
    result.dateOfBirth = date;
  }
  return result;
}

function parseLogin(body) {
  requireBody(body, ['email', 'password']);
  return { email: emailValue(body.email), password: passwordValue(body.password) };
}

function checkParamsAndQuery(req) {
  if (Object.keys(req.params ?? {}).length || Object.keys(req.query ?? {}).length) {
    throw new HttpError(400, 'Auth endpoints do not accept params or query parameters.');
  }
}

export function validateRegister(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    req.validatedBody = parseRegister(req.body);
    next();
  } catch (error) { next(error); }
}

export function validateLogin(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    req.validatedBody = parseLogin(req.body);
    next();
  } catch (error) { next(error); }
}

export function validateEmptyAuthRequest(req, _res, next) {
  try {
    checkParamsAndQuery(req);
    if (req.body !== undefined && (!req.body || typeof req.body !== 'object'
      || Array.isArray(req.body) || Object.keys(req.body).length)) {
      throw new HttpError(400, 'This Auth endpoint does not accept body fields.');
    }
    next();
  } catch (error) { next(error); }
}
