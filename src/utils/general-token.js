import jwt from "jsonwebtoken";

export const generateAccessToken = (user, config) => {
  return jwt.sign({ tokenVersion: user.tokenVersion ?? 0 }, config.jwtSecret, {
    algorithm: "HS256",
    subject: user._id.toString(),
    issuer: "tluphone-api",
    audience: "tluphone-web",
    expiresIn: config.jwtExpiresIn,
  });
};

export const generateRefreshToken = (user, config) => {
  return jwt.sign(
    { tokenVersion: user.tokenVersion ?? 0 },
    config.jwtRefreshSecret,
    {
      algorithm: "HS256",
      subject: user._id.toString(),
      issuer: "tluphone-api",
      audience: "tluphone-refresh",
      expiresIn: config.jwtRefreshExpiresIn,
    },
  );
};
