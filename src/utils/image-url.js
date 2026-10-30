export const isCloudinaryImageUrl = (value) => {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      url.hostname === "res.cloudinary.com" &&
      !url.username &&
      !url.password &&
      !url.port &&
      /^\/[^/]+\/image\/upload\/.+/.test(url.pathname)
    );
  } catch {
    return false;
  }
};

export const isCellphonesImageUrl = (value) => {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password && !url.port &&
      ["cellphones.com.vn", "cdn2.cellphones.com.vn"].includes(url.hostname) &&
      /\/media\/catalog\/product\/.+\.(?:png|jpe?g|webp)$/i.test(url.pathname);
  } catch { return false; }
};
