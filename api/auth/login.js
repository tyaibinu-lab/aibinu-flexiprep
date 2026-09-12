import crypto from "node:crypto";
import { getConfig } from "../lib/config.js";
import {
  airtableList,
  airtableGet,
  airtableUpdate,
} from "../lib/airtable.js";
import {
  createSessionToken,
  setSessionCookie,
} from "../lib/_auth.js";

const MAX_FAILED_ATTEMPTS = 5;
const LOCKOUT_MINUTES = 15;

function send(res, status, body) {
  res.status(status).json(body);
}

function normalizeIdentifier(value) {
  return String(value ?? "").trim().toLowerCase();
}

function verifyPassword(password, encodedHash) {
  if (!encodedHash || typeof encodedHash !== "string") return false;

  const parts = encodedHash.split("$");

  if (parts.length !== 6 || parts[0] !== "scrypt") {
    return false;
  }

  const [, nText, rText, pText, salt, storedHash] = parts;

  const N = Number(nText);
  const r = Number(rText);
  const p = Number(pText);

  if (
    !Number.isInteger(N) ||
    !Number.isInteger(r) ||
    !Number.isInteger(p) ||
    !salt ||
    !storedHash
  ) {
    return false;
  }

  try {
    const derived = crypto.scryptSync(
      password,
      Buffer.from(salt, "base64url"),
      32,
      {
        N,
        r,
        p,
        maxmem: Math.max(128 * N * r + 1024, 32 * 1024 * 1024),
      }
    );

    const expected = Buffer.from(storedHash, "base64url");

    return (
      derived.length === expected.length &&
      crypto.timingSafeEqual(derived, expected)
    );
  } catch {
    return false;
  }
}

function isLocked(fields) {
  const lockedUntil = fields?.["Locked Until"];

  if (!lockedUntil) return false;

  const timestamp = Date.parse(lockedUntil);

  return Number.isFinite(timestamp) && timestamp > Date.now();
}

function escapeFormulaString(value) {
  return JSON.stringify(String(value));
}

function getLinkedRecordId(value) {
  if (Array.isArray(value)) {
    return value[0] || null;
  }

  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }

  return null;
}

async function resolveStudentId(config, fields) {
  const recordId = getLinkedRecordId(fields?.Student);

  if (!recordId) return null;

  try {
    const record = await airtableGet(
      config.airtable.tables.students,
      recordId
    );

    return (
      record?.fields?.["Student ID"] ??
      record?.fields?.Student_ID ??
      record?.fields?.["Student Id"] ??
      null
    );
  } catch {
    return null;
  }
}

async function resolveTeacherId(config, fields) {
  const recordId = getLinkedRecordId(fields?.Teacher);

  return recordId;
}

async function updateLoginFailure(config, userRecord) {
  const fields = userRecord?.fields ?? {};

  const currentAttempts = Number(fields["Failed Attempts"] ?? 0);
  const failedAttempts = Number.isFinite(currentAttempts)
    ? currentAttempts + 1
    : 1;

  const update = {
    "Failed Attempts": failedAttempts,
  };

  if (failedAttempts >= MAX_FAILED_ATTEMPTS) {
    update["Locked Until"] = new Date(
      Date.now() + LOCKOUT_MINUTES * 60 * 1000
    ).toISOString();
  }

  try {
    await airtableUpdate(
      config.airtable.tables.authUsers,
      userRecord.id,
      update
    );
  } catch {
    // Do not expose internal persistence errors during authentication.
  }
}

async function resetLoginFailure(config, userRecord) {
  try {
    await airtableUpdate(
      config.airtable.tables.authUsers,
      userRecord.id,
      {
        "Failed Attempts": 0,
        "Locked Until": null,
        "Last Login": new Date().toISOString(),
      }
    );
  } catch {
    // Login should not fail merely because audit metadata could not be updated.
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, {
      error: "Method not allowed.",
    });
  }

  try {
    const config = getConfig();

    const body =
      req.body && typeof req.body === "object"
        ? req.body
        : {};

    const identifier = normalizeIdentifier(
      body.identifier ?? body.loginIdentifier ?? body.username
    );

    const password = String(body.password ?? "");

    if (!identifier || !password) {
      return send(res, 400, {
        error: "Login identifier and password are required.",
      });
    }

    const formula =
      `LOWER({Login Identifier})=LOWER(${escapeFormulaString(identifier)})`;

    const query = new URLSearchParams({
  filterByFormula: formula,
  maxRecords: "1",
}).toString();

const result = await airtableList(
  config.airtable.tables.authUsers,
  query
);
    const userRecord = result?.records?.[0] ?? null;

    if (!userRecord) {
      return send(res, 401, {
        error: "Invalid login credentials.",
      });
    }

    const fields = userRecord.fields ?? {};

    if (isLocked(fields)) {
      return send(res, 401, {
        error: "Invalid login credentials.",
      });
    }

    const status = String(fields.Status ?? "").trim().toLowerCase();

    if (status && status !== "active") {
      return send(res, 401, {
        error: "Invalid login credentials.",
      });
    }

    const passwordValid = verifyPassword(
      password,
      fields["Password Hash"]
    );

    if (!passwordValid) {
      await updateLoginFailure(config, userRecord);

      return send(res, 401, {
        error: "Invalid login credentials.",
      });
    }

    const role = String(fields.Role ?? "").trim().toLowerCase();

    if (!["student", "teacher", "reviewer", "admin"].includes(role)) {
      return send(res, 403, {
        error: "Account role is not configured correctly.",
      });
    }

    const studentId =
      role === "student"
        ? await resolveStudentId(config, fields)
        : null;

    const teacherId =
      role === "teacher" || role === "reviewer"
        ? await resolveTeacherId(config, fields)
        : null;

    if (role === "student" && !studentId) {
      return send(res, 403, {
        error: "Student account is not properly linked.",
      });
    }

    if (
      (role === "teacher" || role === "reviewer") &&
      !teacherId
    ) {
      return send(res, 403, {
        error: "Staff account is not properly linked.",
      });
    }

    await resetLoginFailure(config, userRecord);

    const token = createSessionToken({
      sub: userRecord.id,
      role,
      studentId: studentId || undefined,
      teacherId: teacherId || undefined,
    });

    setSessionCookie(res, token);

    return send(res, 200, {
      ok: true,
      user: {
        role,
        studentId: studentId || null,
        teacherId: teacherId || null,
      },
    });
  } catch (error) {
    console.error("Authentication error:", error);

    return send(res, 500, {
      error: "Authentication service temporarily unavailable.",
    });
  }
}
