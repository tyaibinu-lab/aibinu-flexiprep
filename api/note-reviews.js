import { requireRole } from "./lib/_auth.js";

import {
  airtableList,
  airtableGet,
  airtableCreate,
  airtableUpdate,
} from "./lib/airtable.js";

import { getConfig } from "./lib/config.js";

const config = getConfig();

const NOTES_TABLE =
  process.env.AIRTABLE_NOTEBANK_NOTES_TABLE ||
  "NoteBank_Notes";

const APPROVALS_TABLE =
  process.env.AIRTABLE_NOTEBANK_APPROVALS_TABLE ||
  "NoteBank_Approvals";

const PUBLICATIONS_TABLE =
  process.env.AIRTABLE_NOTEBANK_PUBLICATIONS_TABLE ||
  "NoteBank_Publications";

const TEACHERS_TABLE =
  config.airtable.tables.teachers ||
  process.env.AIRTABLE_TEACHERS_TABLE ||
  "Teachers";

const CLASSES_TABLE =
  process.env.AIRTABLE_CLASSES_TABLE ||
  "Classes";

const HEADERS = {
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

function sendJson(res, status, payload) {
  res.statusCode = status;

  Object.entries(HEADERS).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  res.end(JSON.stringify(payload));
}

function methodNotAllowed(res) {
  res.setHeader("Allow", "GET, POST, PUT, PATCH");

  return sendJson(res, 405, {
    ok: false,
    success: false,
    error: "Method not allowed",
  });
}

async function readBody(req) {
  if (req.body && typeof req.body === "object") {
    return req.body;
  }

  return new Promise((resolve, reject) => {
    let raw = "";

    req.on("data", (chunk) => {
      raw += chunk;
    });

    req.on("end", () => {
      if (!raw) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(raw));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });

    req.on("error", reject);
  });
}

function firstValue(record, names = []) {
  for (const name of names) {
    const value = record?.fields?.[name];

    if (
      value !== undefined &&
      value !== null &&
      String(value).trim() !== ""
    ) {
      return value;
    }
  }

  return "";
}

function normalizeStatus(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function getAction(req, body) {
  return String(
    body?.action ||
      req.query?.action ||
      ""
  )
    .trim()
    .toLowerCase();
}

function getNoteId(req, body) {
  return String(
    body?.noteId ||
      body?.note_id ||
      req.query?.noteId ||
      req.query?.note_id ||
      ""
  ).trim();
}

function getText(body, ...keys) {
  for (const key of keys) {
    if (
      body?.[key] !== undefined &&
      body?.[key] !== null
    ) {
      const value = String(body[key]).trim();

      if (value) {
        return value;
      }
    }
  }

  return "";
}

function escapeFormulaValue(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

/**
 * Find a note by:
 * 1. Airtable record ID
 * 2. Custom Note ID
 */
async function findNote(noteId) {
  if (!noteId) {
    return null;
  }

  // First try Airtable record ID.
  try {
    const direct = await airtableGet(
      NOTES_TABLE,
      noteId
    );

    if (direct) {
      return direct;
    }
  } catch {
    // Continue to custom Note ID lookup.
  }

  // Then try common custom Note ID fields.
  const escaped = escapeFormulaValue(noteId);

  const formula =
    `OR(` +
    `{Note ID}="${escaped}",` +
    `{Note_ID}="${escaped}",` +
    `{noteId}="${escaped}",` +
    `{ID}="${escaped}"` +
    `)`;

  try {
    const result = await airtableList(
      NOTES_TABLE,
      new URLSearchParams({
        filterByFormula: formula,
        maxRecords: "1",
      }).toString()
    );

    return result?.records?.[0] || null;
  } catch {
    return null;
  }
}

function noteIdFromRecord(record) {
  return String(
    firstValue(record, [
      "Note ID",
      "Note_ID",
      "noteId",
      "ID",
    ]) ||
      record?.id ||
      ""
  ).trim();
}

async function findApprovalForNote(noteId) {
  if (!noteId) {
    return null;
  }

  const escaped = escapeFormulaValue(noteId);

  const formula =
    `OR(` +
    `{Note ID}="${escaped}",` +
    `{Note_ID}="${escaped}",` +
    `{noteId}="${escaped}"` +
    `)`;

  try {
    const result = await airtableList(
      APPROVALS_TABLE,
      new URLSearchParams({
        filterByFormula: formula,
        maxRecords: "1",
      }).toString()
    );

    return result?.records?.[0] || null;
  } catch {
    return null;
  }
}

async function findPublicationForNote(noteId) {
  if (!noteId) {
    return null;
  }

  const escaped = escapeFormulaValue(noteId);

  const formula =
    `OR(` +
    `{Note ID}="${escaped}",` +
    `{Note_ID}="${escaped}",` +
    `{noteId}="${escaped}"` +
    `)`;

  try {
    const result = await airtableList(
      PUBLICATIONS_TABLE,
      new URLSearchParams({
        filterByFormula: formula,
        maxRecords: "1",
      }).toString()
    );

    return result?.records?.[0] || null;
  } catch {
    return null;
  }
}

/**
 * Convert an Airtable note record into the flat object
 * expected by ReviewerDashboard.jsx.
 */
function flattenNoteRecord(record, approval, publication) {
  const fields = record?.fields || {};
  const noteId = noteIdFromRecord(record);

  return {
    ...fields,

    airtableId: record?.id || "",
    "Note ID": noteId,

    approval: approval
      ? {
          id: approval.id,
          fields: approval.fields || {},
        }
      : null,

    publication: publication
      ? {
          id: publication.id,
          fields: publication.fields || {},
        }
      : null,
  };
}

/**
 * GET /api/note-reviews?list=review
 */
async function listReviewQueue(res) {
  const formula =
    `OR(` +
    `{Status}="Under Review",` +
    `{Status}="under_review",` +
    `{Status}="Under review"` +
    `)`;

  const result = await airtableList(
    NOTES_TABLE,
    new URLSearchParams({
      filterByFormula: formula,
      maxRecords: "100",
    }).toString()
  );

  const records = result?.records || [];

  const notes = await Promise.all(
    records.map(async (record) => {
      const noteId =
        noteIdFromRecord(record);

      const approval =
        await findApprovalForNote(noteId);

      const publication =
        await findPublicationForNote(noteId);

      return flattenNoteRecord(
        record,
        approval,
        publication
      );
    })
  );

  return sendJson(res, 200, {
    ok: true,
    success: true,
    notes,
  });
}

/**
 * GET /api/note-reviews?list=classes
 */
async function listClasses(res) {
  const result = await airtableList(
    CLASSES_TABLE,
    new URLSearchParams({
      maxRecords: "100",
    }).toString()
  );

  const records = result?.records || [];

  const classes = records.map((record) => {
    const fields = record?.fields || {};

    return {
      id:
        fields["Class ID"] ||
        fields["Class_ID"] ||
        fields["ID"] ||
        record.id,

      airtableId: record.id,

      name:
        fields["Name"] ||
        fields["Class Name"] ||
        fields["Class"] ||
        fields["name"] ||
        record.id,

      code:
        fields["Code"] ||
        fields["Class Code"] ||
        fields["Class_Code"] ||
        "",
    };
  });

  return sendJson(res, 200, {
    ok: true,
    success: true,
    classes,
  });
}

/**
 * GET /api/note-reviews?noteId=...
 */
async function getSingleReview(res, noteId) {
  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "Note not found",
    });
  }

  const resolvedNoteId =
    noteIdFromRecord(note);

  const approval =
    await findApprovalForNote(
      resolvedNoteId
    );

  const publication =
    await findPublicationForNote(
      resolvedNoteId
    );

  return sendJson(res, 200, {
    ok: true,
    success: true,

    note: {
      ...note.fields,
      id: note.id,
      airtableId: note.id,
      "Note ID": resolvedNoteId,
    },

    approval: approval
      ? {
          id: approval.id,
          fields: approval.fields || {},
        }
      : null,

    publication: publication
      ? {
          id: publication.id,
          fields: publication.fields || {},
        }
      : null,
  });
}

/**
 * Teacher saves an editable draft.
 */
async function saveDraft(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "Note not found",
    });
  }

  const fields = {};

  const allowedFields = [
    "Title",
    "Topic",
    "Subject",
    "Content",
    "Content_JSON",
    "Content JSON",
    "Status",
    "Programme",
    "Class",
    "Academic_Level",
    "Academic Level",
    "Subject_ID",
    "Topic_ID",
  ];

  for (const fieldName of allowedFields) {
    if (
      body[fieldName] !== undefined
    ) {
      fields[fieldName] =
        body[fieldName];
    }
  }

  if (
    Object.keys(fields).length === 0
  ) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error:
        "No editable fields supplied",
    });
  }

  const updated =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      fields
    );

  return sendJson(res, 200, {
    ok: true,
    success: true,
    message: "Note saved",
    note: updated,

    user: {
      role: authenticatedUser.role,
      teacherId:
        authenticatedUser.teacherId ||
        null,
    },
  });
}

/**
 * Teacher submits a note for human review.
 */
async function submitForReview(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "Note not found",
    });
  }

  /*
   * Identity comes from the authenticated session.
   * Do not trust a browser-supplied teacher ID.
   */
  const submittedBy =
    authenticatedUser.teacherId ||
    null;

  /*
   * IMPORTANT:
   * NoteBank_Notes should only receive fields that
   * actually belong to that table.
   *
   * In particular, Submitted_By is NOT written here.
   */
  const updatedNote =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      {
        Status: "Under Review",
      }
    );

  const resolvedNoteId =
    noteIdFromRecord(note);

  const existingApproval =
    await findApprovalForNote(
      resolvedNoteId
    );

  /*
   * Keep the approval payload conservative.
   * Submitted_By was previously causing the Airtable
   * "Unknown field name" failure.
   */
  const approvalFields = {
    Status: "Under Review",
  };

  let approval;

  if (existingApproval) {
    approval =
      await airtableUpdate(
        APPROVALS_TABLE,
        existingApproval.id,
        approvalFields
      );
  } else {
    approval =
      await airtableCreate(
        APPROVALS_TABLE,
        {
          ...approvalFields,
          "Note ID": resolvedNoteId,
        }
      );
  }

  return sendJson(res, 200, {
    ok: true,
    success: true,

    message:
      "Note submitted for review",

    note: updatedNote,

    approval,

    submittedBy,
  });
}

/**
 * Reviewer approves and publishes a note.
 */
async function approveNote(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "Note not found",
    });
  }

  const reviewerId =
    authenticatedUser.teacherId ||
    null;

  const programme =
    getText(
      body,
      "targetProgramme",
      "Target Programme",
      "programme"
    );

  const targetClass =
    getText(
      body,
      "targetClass",
      "Target Class",
      "class"
    );

  if (!programme) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error:
        "Target Programme is required",
    });
  }

  if (!targetClass) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error:
        "Target Class is required",
    });
  }

  const resolvedNoteId =
    noteIdFromRecord(note);

  /*
   * Update approval record.
   */
  const approval =
    await findApprovalForNote(
      resolvedNoteId
    );

  const approvalFields = {
    Status: "Approved",
    Decision: "Approved",
    "Reviewed At":
      new Date().toISOString(),
  };

  if (reviewerId) {
    approvalFields.Reviewer =
      reviewerId;
  }

  let savedApproval;

  if (approval) {
    savedApproval =
      await airtableUpdate(
        APPROVALS_TABLE,
        approval.id,
        approvalFields
      );
  } else {
    savedApproval =
      await airtableCreate(
        APPROVALS_TABLE,
        {
          ...approvalFields,
          "Note ID": resolvedNoteId,
        }
      );
  }

  /*
   * Publication-specific fields belong in
   * NoteBank_Publications, not NoteBank_Notes.
   */
  const publication =
    await findPublicationForNote(
      resolvedNoteId
    );

  const publicationFields = {
    Status: "Published",

    "Target Programme":
      programme,

    "Target Class":
      targetClass,

    "Published At":
      new Date().toISOString(),
  };

  if (reviewerId) {
    publicationFields["Published By"] =
      reviewerId;
  }

  let savedPublication;

  if (publication) {
    savedPublication =
      await airtableUpdate(
        PUBLICATIONS_TABLE,
        publication.id,
        publicationFields
      );
  } else {
    savedPublication =
      await airtableCreate(
        PUBLICATIONS_TABLE,
        {
          ...publicationFields,
          "Note ID": resolvedNoteId,
        }
      );
  }

  /*
   * Only after approval/publication succeeds,
   * mark the NoteBank note as Published.
   */
  const updatedNote =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      {
        Status: "Published",
      }
    );

  return sendJson(res, 200, {
    ok: true,
    success: true,

    message:
      "Note approved and published",

    note: updatedNote,

    approval:
      savedApproval,

    publication:
      savedPublication,
  });
}

/**
 * Reviewer requests changes.
 */
async function requestChanges(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const comment =
    getText(
      body,
      "comment",
      "comments",
      "reviewComment",
      "reviewerComment"
    );

  if (!comment) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error:
        "A review comment is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "Note not found",
    });
  }

  const reviewerId =
    authenticatedUser.teacherId ||
    null;

  const resolvedNoteId =
    noteIdFromRecord(note);

  const approval =
    await findApprovalForNote(
      resolvedNoteId
    );

  const approvalFields = {
    Status: "Changes Requested",
    Decision: "Changes Requested",
    Comments: comment,
    "Reviewed At":
      new Date().toISOString(),
  };

  if (reviewerId) {
    approvalFields.Reviewer =
      reviewerId;
  }

  let savedApproval;

  if (approval) {
    savedApproval =
      await airtableUpdate(
        APPROVALS_TABLE,
        approval.id,
        approvalFields
      );
  } else {
    savedApproval =
      await airtableCreate(
        APPROVALS_TABLE,
        {
          ...approvalFields,
          "Note ID": resolvedNoteId,
        }
      );
  }

  /*
   * If a publication already exists, make it
   * unavailable while changes are being made.
   */
  const existingPublication =
    await findPublicationForNote(
      resolvedNoteId
    );

  if (existingPublication) {
    await airtableUpdate(
      PUBLICATIONS_TABLE,
      existingPublication.id,
      {
        Status: "Unpublished",
      }
    );
  }

  const updatedNote =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      {
        Status: "Changes Requested",
      }
    );

  return sendJson(res, 200, {
    ok: true,
    success: true,

    message:
      "Changes requested",

    note: updatedNote,

    approval:
      savedApproval,
  });
}

/**
 * Main API handler.
 */
export default async function handler(
  req,
  res
) {
  if (
    ![
      "GET",
      "POST",
      "PUT",
      "PATCH",
    ].includes(req.method)
  ) {
    return methodNotAllowed(res);
  }

  let body = {};

  if (req.method !== "GET") {
    try {
      body = await readBody(req);
    } catch {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        error: "Invalid JSON body",
      });
    }
  }

  const action =
    getAction(req, body);

  let authenticatedUser;

  /*
   * GET:
   * reviewer/admin only.
   */
  if (req.method === "GET") {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["reviewer", "admin"]
      );
  }

  /*
   * Approve:
   * reviewer/admin only.
   */
  else if (
    action === "approve"
  ) {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["reviewer", "admin"]
      );
  }

  /*
   * Request changes:
   * reviewer/admin only.
   */
  else if (
    [
      "request_changes",
      "changes",
      "reject",
    ].includes(action)
  ) {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["reviewer", "admin"]
      );
  }

  /*
   * Teacher operations:
   * teacher/admin only.
   */
  else if (
    [
      "save",
      "submit",
    ].includes(action)
  ) {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["teacher", "admin"]
      );
  }

  /*
   * Unknown actions:
   * admin only.
   */
  else {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["admin"]
      );
  }

  if (!authenticatedUser) {
    return;
  }

  try {
    /*
     * GET operations.
     */
    if (req.method === "GET") {
      const noteId =
        getNoteId(req, body);

      if (noteId) {
        return getSingleReview(
          res,
          noteId
        );
      }

      const list =
        String(
          req.query?.list || ""
        )
          .trim()
          .toLowerCase();

      if (
        list === "classes"
      ) {
        return listClasses(res);
      }

      if (
        list === "review" ||
        list === "queue" ||
        !list
      ) {
        return listReviewQueue(res);
      }

      return sendJson(res, 400, {
        ok: false,
        success: false,
        error:
          "Unsupported list parameter",
      });
    }

    /*
     * Teacher saves draft.
     */
    if (action === "save") {
      return saveDraft(
        res,
        body,
        authenticatedUser
      );
    }

    /*
     * Teacher submits note for review.
     */
    if (action === "submit") {
      return submitForReview(
        res,
        body,
        authenticatedUser
      );
    }

    /*
     * Reviewer approves and publishes.
     */
    if (action === "approve") {
      return approveNote(
        res,
        body,
        authenticatedUser
      );
    }

    /*
     * Reviewer requests changes.
     */
    if (
      [
        "request_changes",
        "changes",
        "reject",
      ].includes(action)
    ) {
      return requestChanges(
        res,
        body,
        authenticatedUser
      );
    }

    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "Unsupported action",
    });
  } catch (error) {
    console.error(
      "NoteBank reviewer API error:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      success: false,
      error:
        "Unable to process NoteBank review request",
    });
  }
}