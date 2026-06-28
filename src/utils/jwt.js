const jwt = require("jsonwebtoken");

const DEFAULT_JWT_EXPIRES_IN = "7d";

function getJwtSecret() {
  return process.env.JWT_SECRET;
}

function getPreviousJwtSecrets() {
  return (process.env.JWT_PREVIOUS_SECRETS || "")
    .split(",")
    .map((secret) => secret.trim())
    .filter(Boolean);
}

function signAuthToken(userId) {
  return jwt.sign({ userId }, getJwtSecret(), {
    expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_JWT_EXPIRES_IN,
  });
}

function verifyAuthToken(token) {
  const secrets = [getJwtSecret(), ...getPreviousJwtSecrets()].filter(Boolean);
  let lastError;

  for (const secret of secrets) {
    try {
      return jwt.verify(token, secret);
    } catch (err) {
      lastError = err;
    }
  }

  throw lastError || new Error("JWT_SECRET is not configured");
}

module.exports = {
  DEFAULT_JWT_EXPIRES_IN,
  signAuthToken,
  verifyAuthToken,
};
