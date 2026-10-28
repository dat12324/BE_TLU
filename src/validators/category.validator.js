import { validateCatalogInput } from "./catalog.validator.js";

export const validateCreateCategory = validateCatalogInput("image");

export const validateUpdateCategory = validateCatalogInput("image", true);
