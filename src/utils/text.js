export const normalizeName = (value) => {
  return typeof value === "string"
    ? value.normalize("NFC").replace(/\s+/gu, " ").trim()
    : value;
};

export const normalizeStringArray = (value, lowercase = false) => {
  if (!Array.isArray(value)) return value;
  return value
    .map((item) =>
      typeof item === "string"
        ? lowercase
          ? item.trim().toLowerCase()
          : item.trim()
        : item,
    )
    .filter((item) => item != null && item !== "");
};
