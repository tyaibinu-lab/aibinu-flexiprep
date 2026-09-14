import crypto from "node:crypto";
import { getConfig } from "./config.js";

const IS_PRODUCTION =
  process.env.APP_ENV === "production" ||
  process.env.NODE_ENV === "production";

const COOKIE_NAME = IS_PRODUCTION
  ? "__Host-aibinu_session"
  : "aibinu_session";
const SESSION_TTL_SECONDS = 8 * 60 * 60;

const ISSUER = "aibinu-flexiprep";
const AUDIENCE = "aibinu-flexiprep-web";

const ALLOWED_ROLES = new Set([
  "student",
  "teacher",
  "reviewer",
  "admin",
]);

function base64urlEncode(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64urlDecode(value) {
  const padding = value.length % 4;

  const normalized =
    value.replace(/-/g, "+").replace(/_/g, "/") +
    "=".repeat(padding ? 4 - padding : 0);

  return Buffer.from(normalized, "base64").toString("utf8");
}

function sign(unsignedToken, secret) {
  return base64urlEncode(
    crypto
      .createHmac("sha256", secret)
      .update(unsignedToken)
      .digest()
  );
}

function safeEqual(a, b) {
  const aBuffer = Buffer.from(a);
  const bBuffer = Buffer.from(b);

  if (aBuffer.length !== bBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(aBuffer, bBuffer);
}

export function createSessionToken(claims = {}) {
  const config = getConfig();

  const now = Math.floor(Date.now() / 1000);

  const payload = {
    sub: String(claims.sub || ""),
    role: String(claims.role || ""),
    studentId: claims.studentId
      ? String(claims.studentId)
      : undefined,
    teacherId: claims.teacherId
      ? String(claims.teacherId)
      : undefined,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
    jti: crypto.randomUUID(),
    iss: ISSUER,
    aud: AUDIENCE,
  };

  if (!payload.sub) {
    throw new Error("Session subject is required.");
  }

  if (!ALLOWED_ROLES.has(payload.role)) {
    throw new Error("Invalid session role.");
  }

  const encodedPayload = base64urlEncode(
    JSON.stringify(payload)
  );

  const unsignedToken = `v1.${encodedPayload}`;

  const signature = sign(
    unsignedToken,
    config.authSecret
  );

  return `${unsignedToken}.${signature}`;
}

export function verifySessionToken(token) {
  if (!token) {
    return null;
  }

  const config = getConfig();

  const parts = String(token).split(".");

  if (parts.length !== 3 || parts[0] !== "v1") {
    return null;
  }

  const unsignedToken = `${parts[0]}.${parts[1]}`;

  const expectedSignature = sign(
    unsignedToken,
    config.authSecret
  );

  if (!safeEqual(parts[2], expectedSignature)) {
    return null;
  }

  let payload;

  try {
    payload = JSON.parse(
      base64urlDecode(parts[1])
    );
  } catch {
    return null;
  }

  const now = Math.floor(Date.now() / 1000);

  if (!payload || typeof payload !== "object") {
    return null;
  }

  if (
    !payload.sub ||
    !ALLOWED_ROLES.has(payload.role)
  ) {
    return null;
  }

  if (
    !Number.isInteger(payload.iat) ||
    !Number.isInteger(payload.exp)
  ) {
    return null;
  }

  if (payload.exp <= now) {
    return null;
  }

  if (payload.iat > now + 60) {
    return null;
  }

  if (
    payload.iss !== ISSUER ||
    payload.aud !== AUDIENCE
  ) {
    return null;
  }

  return payload;
}

function parseCookies(header) {
  const cookies = {};

  if (!header) {
    return cookies;
  }

  for (const part of String(header).split(";")) {
    const separator = part.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const name = part
      .slice(0, separator)
      .trim();

    const rawValue = part
      .slice(separator + 1)
      .trim();

    try {
      cookies[name] = decodeURIComponent(rawValue);
    } catch {
      cookies[name] = rawValue;
    }
  }

  return cookies;
}

export function getCurrentUser(req) {
  const cookies = parseCookies(
    req.headers?.cookie
  );

  const token = cookies[COOKIE_NAME];

  return verifySessionToken(token);
}

export function authenticate(req) {
  return getCurrentUser(req);
}

export function requireAuth(req, res) {
  const user = authenticate(req);

  if (!user) {
    res.statusCode = 401;
    res.setHeader(
      "Content-Type",
      "application/json"
    );

    res.end(
      JSON.stringify({
        error: "Authentication required.",
      })
    );

    return null;
  }

  return user;
}

export function requireRole(req, res, role) {
  const user = requireAuth(req, res);

  if (!user) {
    return null;
  }

  const allowedRoles = Array.isArray(role)
    ? role
    : [role];

  if (!allowedRoles.includes(user.role)) {
    res.statusCode = 403;
    res.setHeader(
      "Content-Type",
      "application/json"
    );

    res.end(
      JSON.stringify({
        error: "Insufficient permissions.",
      })
    );

    return null;
  }

  return user;
}

export function setSessionCookie(res, token) {
  const isProduction =
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production";

  const cookieName = isProduction
    ? "__Host-aibinu_session"
    : "aibinu_session";

  const secure = isProduction ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function clearSessionCookie(res) {
  const isProduction =
    process.env.APP_ENV === "production" ||
    process.env.NODE_ENV === "production";

  const cookieName = isProduction
    ? "__Host-aibinu_session"
    : "aibinu_session";

  const secure = isProduction ? "; Secure" : "";

  res.setHeader(
    "Set-Cookie",
    `${cookieName}=; Path=/; HttpOnly${secure}; SameSite=Lax; Max-Age=0`
  );
}

export function getAuthConfig() {
  return {
    cookieName: COOKIE_NAME,
    sessionTtlSeconds: SESSION_TTL_SECONDS,
    issuer: ISSUER,
    audience: AUDIENCE,
    allowedRoles: [...ALLOWED_ROLES],
  };
}