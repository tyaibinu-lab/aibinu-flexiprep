import { requireRole } from "../lib/_auth.js";
import { getConfig } from "../lib/config.js";
import {
  airtableList,
  airtableCreate,
} from "../lib/airtable.js";
import { hashPassword } from "../lib/_password.js";
import { generateUserId } from "../lib/_user-id.js";

function send(res, status, body) {
  return res.status(status).json(body);
}

function normalizeIdentifier(value) {
  return String(value ?? "").trim().toLowerCase();
}

function escapeAirtableString(value) {
  return String(value).replace(/'/g, "''");
}

function buildFilterQuery(identifier) {
  const formula = `{Login Identifier}='${escapeAirtableString(identifier)}'`;

  return `filterByFormula=${encodeURIComponent(formula)}&maxRecords=1`;
}

function isValidRole(role) {
  return ["student", "teacher", "reviewer", "admin"].includes(role);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");

    return send(res, 405, {
      error: "Method not allowed.",
    });
  }

  try {
    const admin = requireRole(req, res, "admin");

    if (!admin) {
      return;
    }

    const config = getConfig();

    const {
      identifier,
      password,
      role,
      studentRecordId,
      teacherRecordId,
    } = req.body || {};

    const loginIdentifier = normalizeIdentifier(identifier);

    if (!loginIdentifier) {
      return send(res, 400, {
        error: "Login identifier is required.",
      });
    }

    if (typeof password !== "string" || password.length < 8) {
      return send(res, 400, {
        error: "Password must be at least 8 characters long.",
      });
    }

    if (!isValidRole(role)) {
      return send(res, 400, {
        error: "Invalid account role.",
      });
    }

    if (role === "student" && !studentRecordId) {
      return send(res, 400, {
        error: "Student record is required for a student account.",
      });
    }

    if (role === "teacher" && !teacherRecordId) {
      return send(res, 400, {
        error: "Teacher record is required for a teacher account.",
      });
    }

    const existing = await airtableList(
      config.airtable.tables.authUsers,
      buildFilterQuery(loginIdentifier)
    );

    if (existing?.records?.length > 0) {
      return send(res, 409, {
        error: "Login identifier already exists.",
      });
    }

    const now = new Date().toISOString();
    const userId = generateUserId();
    const passwordHash = hashPassword(password);

    const fields = {
      "User ID": userId,
      "Login Identifier": loginIdentifier,
      "Password Hash": passwordHash,
      Role: role,
      Status: "Active",
      "Failed Attempts": 0,
      "Password Changed At": now,
      Created: now,
    };

    if (role === "student") {
      fields.Student = [studentRecordId];
    }

    if (role === "teacher") {
      fields.Teacher = [teacherRecordId];
    }

    const created = await airtableCreate(
      config.airtable.tables.authUsers,
      fields
    );

    return send(res, 201, {
      ok: true,
      message: "User account created successfully.",
      user: {
        userId: created?.fields?.["User ID"] ?? userId,
        loginIdentifier,
        role,
        status: "Active",
      },
    });
  } catch (error) {
    console.error("Account provisioning error:", error);

    return send(res, 500, {
      error: "Account provisioning service temporarily unavailable.",
    });
  }
}