import { validationResult } from "express-validator";
import { HttpError } from "../utils/http-error.js";

export const validateRequest = (req, _res, next) => {
  const errors = validationResult(req).array();
  if (errors.length) {
    return next(new HttpError(400, errors[0].msg));
  }
  next();
};
