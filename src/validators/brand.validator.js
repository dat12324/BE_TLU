import { validateCatalogInput } from "./catalog.validator.js";

export const validateCreateBrand = validateCatalogInput("logo");

export const validateUpdateBrand = validateCatalogInput("logo", true);
