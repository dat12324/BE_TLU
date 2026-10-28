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
