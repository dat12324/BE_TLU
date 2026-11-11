import mongoose from "mongoose";

export const createImageSchema = ({
  includeAlt = false,
  includeIsPrimary = false,
} = {}) => {
  const fields = {
    url: { type: String, trim: true },
    publicId: { type: String, trim: true },
  };
  if (includeAlt) fields.alt = { type: String, trim: true };
  if (includeIsPrimary) fields.isPrimary = { type: Boolean, default: false };
  return new mongoose.Schema(fields, { _id: false });
};
