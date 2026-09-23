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

/**
 * Find the pending approval belonging to a NoteBank note.
 *
 * NoteBank_Approvals.Note is a linked Airtable field,
 * so we compare the linked Airtable record ID directly.
 */
async function findApprovalForNote(noteRecordId) {
  if (!noteRecordId) {
    return null;
  }

  try {
    const result = await airtableList(
      APPROVALS_TABLE,
      new URLSearchParams({
        pageSize: "100",
      }).toString()
    );

    const records = Array.isArray(result?.records)
      ? result.records
      : [];

    return (
      records.find((record) => {
        const fields = record?.fields || {};

        const linkedNotes = Array.isArray(
          fields["Note"]
        )
          ? fields["Note"]
          : [];

        const status = String(
          fields["Status"] || ""
        ).trim();

        return (
          linkedNotes.includes(
            String(noteRecordId)
          ) &&
          status === "Pending"
        );
      }) || null
    );
  } catch (error) {
    console.error(
      "Failed to find pending NoteBank approval:",
      error
    );

    return null;
  }
}

/**
 * Find a publication belonging to a NoteBank note.
 *
 * NoteBank_Publications.Note is a linked Airtable
 * field, so the lookup uses the Airtable record ID.
 *
 * When a version is supplied, the publication must also
 * belong to that exact Note version.
 */
async function findPublicationForNote(
  noteRecordId,
  version = null
) {
  if (!noteRecordId) {
    return null;
  }

  try {
    const result = await airtableList(
      PUBLICATIONS_TABLE,
      new URLSearchParams({
        pageSize: "100",
      }).toString()
    );

    const records = Array.isArray(result?.records)
      ? result.records
      : [];

    return (
      records.find((record) => {
        const fields = record?.fields || {};

        const linkedNotes = Array.isArray(
          fields["Note"]
        )
          ? fields["Note"]
          : [];

        if (
          !linkedNotes.includes(
            String(noteRecordId)
          )
        ) {
          return false;
        }

        if (
          version !== null &&
          version !== undefined
        ) {
          const publicationVersion =
            String(
              fields["Version"] ?? ""
            ).trim();

          return (
            publicationVersion ===
            String(version).trim()
          );
        }

        return true;
      }) || null
    );
  } catch (error) {
    console.error(
      "Failed to find NoteBank publication:",
      error
    );

    return null;
  }
}

/**
 * Convert an Airtable note record into the flat object
 * expected by ReviewerDashboard.jsx.
 */
function flattenNoteRecord(
  record,
  approval,
  publication
) {
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
        await findApprovalForNote(
          noteId
        );

      const version =
        record?.fields?.Version || 1;

      const publication =
        await findPublicationForNote(
          noteId,
          version
        );

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
 * Find a Class record by:
 * 1. Airtable record ID
 * 2. Class ID
 * 3. Class name
 * 4. Class code
 */
async function findClassRecord(
  classValue
) {
  const value =
    String(classValue || "").trim();

  if (!value) {
    return null;
  }

  const result = await airtableList(
    CLASSES_TABLE,
    new URLSearchParams({
      maxRecords: "100",
    }).toString()
  );

  const records =
    result?.records || [];

  return (
    records.find((record) => {
      const fields =
        record?.fields || {};

      const classId =
        fields["Class ID"] ||
        fields["Class_ID"] ||
        fields["ID"] ||
        "";

      const className =
        fields["Name"] ||
        fields["Class Name"] ||
        fields["Class"] ||
        fields["name"] ||
        "";

      const classCode =
        fields["Code"] ||
        fields["Class Code"] ||
        fields["Class_Code"] ||
        "";

      return (
        record.id === value ||
        String(classId) === value ||
        String(className) === value ||
        String(classCode) === value
      );
    }) || null
  );
}

/**
 * GET /api/note-reviews?list=classes
 *
 * Returns the class records required by
 * ReviewerDashboard.jsx.
 */
async function listClasses(res) {
  try {
    const result = await airtableList(
      CLASSES_TABLE,
      new URLSearchParams({
        maxRecords: "100",
      }).toString()
    );

    const records =
      Array.isArray(result?.records)
        ? result.records
        : [];

    const classes =
      records.map((record) => {
        const fields =
          record?.fields || {};

        return {
          id:
            fields["Class ID"] ||
            fields["Class_ID"] ||
            fields["ID"] ||
            record.id,

          airtableId:
            record.id,

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
  } catch (error) {
    console.error(
      "Failed to list Classes:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      success: false,
      error:
        "Unable to load classes",
    });
  }
}

/**
 * GET /api/note-reviews?noteId=...
 */
async function getSingleReview(
  res,
  noteId
) {
  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note =
    await findNote(noteId);

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

  const version =
    note?.fields?.Version || 1;

  const publication =
    await findPublicationForNote(
      resolvedNoteId,
      version
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
          fields:
            approval.fields || {},
        }
      : null,

    publication: publication
      ? {
          id: publication.id,
          fields:
            publication.fields || {},
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
  const noteId =
    getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note =
    await findNote(noteId);

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

    "Learning Objectives",
    "Key Terms",
    "Examples",
    "Worked Examples",
    "Formulae",
    "Applications",
    "Common Misconceptions",
    "Summary",
    "Exam Tips",

    "WAEC Focus",
    "NECO Focus",
    "UTME Focus",

    "Diagrams",
    "Visual Components",

    "Teacher Prompt",
    "Review Comment",

    "Status",

    // Existing compatibility fields
    "Programme",
    "Class",
    "Academic_Level",
    "Academic Level",
    "Subject_ID",
    "Topic_ID",
  ];

  for (
    const fieldName of allowedFields
  ) {
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
      role:
        authenticatedUser.role,
      teacherId:
        authenticatedUser.teacherId ||
        null,
    },
  });
}

/**
 * Teacher submits a note for human review.
 *
 * Security:
 * - noteId identifies the note being submitted.
 * - teacher identity comes ONLY from the authenticated session.
 * - Submitted By is written to the NoteBank_Approvals
 *   linked Teachers field.
 * - Reviewer remains empty until a reviewer acts.
 */
async function submitForReview(
  res,
  body,
  authenticatedUser
) {
  const noteId =
    getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note =
    await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      success: false,
      error: "Note not found",
    });
  }

  /*
   * Identity MUST come from the signed
   * authenticated session.
   */
  const submittedBy =
    authenticatedUser?.teacherId ||
    null;

  if (!submittedBy) {
    return sendJson(res, 403, {
      ok: false,
      success: false,
      error:
        "Authenticated teacher is not linked to a Teacher record.",
    });
  }

  /*
   * The Airtable record ID is what the
   * NoteBank_Approvals linked field "Note"
   * expects.
   */
  const noteRecordId =
    String(note.id || "").trim();

  if (!noteRecordId) {
    return sendJson(res, 500, {
      ok: false,
      success: false,
      error:
        "The note does not have a valid Airtable record ID.",
    });
  }

  /*
   * Prevent duplicate pending submissions.
   */
  const existingApproval =
    await findApprovalForNote(
      noteRecordId
    );

  if (existingApproval) {
    return sendJson(res, 409, {
      ok: false,
      success: false,
      error:
        "This note is already pending review.",
      approval:
        existingApproval,
    });
  }

  /*
   * Only editable/draft states can be submitted.
   */
  const currentStatus =
    String(
      note?.fields?.Status || ""
    ).trim();

  const allowedStatuses = [
    "AI Draft",
    "Draft",
    "Changes Requested",
  ];

  if (
    currentStatus &&
    !allowedStatuses.includes(
      currentStatus
    )
  ) {
    return sendJson(res, 409, {
      ok: false,
      success: false,
      error:
        `This note cannot be submitted from status "${currentStatus}".`,
    });
  }

  /*
   * Preserve the note version.
   */
  const version =
    String(
      note?.fields?.Version || "1"
    ).trim();

  /*
   * STEP 1:
   * Move the NoteBank_Notes record to
   * Under Review.
   */
  let updatedNote;

  try {
    updatedNote =
      await airtableUpdate(
        NOTES_TABLE,
        noteRecordId,
        {
          Status:
            "Under Review",
        }
      );
  } catch (error) {
    console.error(
      "Failed to move note to Under Review:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      success: false,
      error:
        "Unable to move the note into the review workflow.",
    });
  }

  /*
   * STEP 2:
   * Create the NoteBank_Approvals record
   * using the actual Airtable schema.
   */
  try {
    const approvalFields = {
      Note: [noteRecordId],

      "Submitted By":
        [submittedBy],

      Reviewer: [],

      "Submission Date":
        new Date().toISOString(),

      "Review Date": null,

      Status: "Pending",

      "Reviewer Comments":
        "",

      Version: version,
    };

    const approval =
      await airtableCreate(
        APPROVALS_TABLE,
        approvalFields
      );

    return sendJson(res, 200, {
      ok: true,
      success: true,

      message:
        "Note submitted for review.",

      note: updatedNote,

      approval,

      status:
        "Under Review",

      approvalStatus:
        "Pending",
    });
  } catch (error) {
    console.error(
      "Failed to create NoteBank approval:",
      error
    );

    /*
     * Roll the NoteBank note back if the
     * approval record could not be created.
     */
    try {
      await airtableUpdate(
        NOTES_TABLE,
        noteRecordId,
        {
          Status:
            currentStatus ||
            "Draft",
        }
      );
    } catch (
      rollbackError
    ) {
      console.error(
        "Failed to rollback note status:",
        rollbackError
      );
    }

    return sendJson(res, 500, {
      ok: false,
      success: false,
      error:
        "The review request could not be created. The note was returned to its previous status.",
    });
  }
}

/**
 * Reviewer approves and publishes a note.
 */
async function approveNote(
  res,
  body,
  authenticatedUser
) {
  const noteId =
    getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error: "noteId is required",
    });
  }

  const note =
    await findNote(noteId);

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

  const reviewComment =
    getText(
      body,
      "reviewComment",
      "reviewerComment",
      "comment",
      "comments"
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

  /*
   * Resolve the class to an actual Airtable
   * Classes record.
   */
  const classRecord =
    await findClassRecord(
      targetClass
    );

  if (!classRecord) {
    return sendJson(res, 400, {
      ok: false,
      success: false,
      error:
        "Target Class could not be resolved.",
    });
  }

  const resolvedNoteId =
    noteIdFromRecord(note);

  const resolvedClassId =
    classRecord.id;

  /*
   * Update approval record.
   */
  const approval =
    await findApprovalForNote(
      resolvedNoteId
    );

  const approvalFields = {
    Status: "Approved",

    "Review Date":
      new Date().toISOString(),

    "Reviewer Comments":
      reviewComment || "",
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
          Note:
            [resolvedNoteId],
        }
      );
  }

  /*
   * Publication-specific fields belong in
   * NoteBank_Publications, not NoteBank_Notes.
   */
  const version =
    note?.fields?.Version || 1;

  const publication =
    await findPublicationForNote(
      resolvedNoteId,
      version
    );

  const publicationFields = {
    Status: "Published",

    Note:
      [resolvedNoteId],

    Version:
      version,

    "Target Programme":
      programme,

    "Target Class":
      [resolvedClassId],

    "Publish Date":
      new Date().toISOString(),
  };

  if (reviewerId) {
    publicationFields[
      "Published By"
    ] = reviewerId;
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
        publicationFields
      );
  }

  /*
   * Only after approval/publication succeeds,
   * mark the NoteBank note as Published.
   */
  const publicationTimestamp =
    new Date().toISOString();

  const notePublicationFields = {
    Status: "Published",

    "Approved Date":
      publicationTimestamp,

    "Published Date":
      publicationTimestamp,

    "Updated Date":
      publicationTimestamp,

    "Review Comment":
      reviewComment || "",
  };

  if (reviewerId) {
    notePublicationFields[
      "Approved By"
    ] = reviewerId;
  }

  const updatedNote =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      notePublicationFields
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
  const noteId =
    getNoteId(null, body);

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

  const note =
    await findNote(noteId);

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
  Status:
    "Changes Requested",

  "Review Date":
    new Date().toISOString(),

  "Reviewer Comments":
    comment || "",
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
          Note:
            [resolvedNoteId],
        }
      );
  }

  /*
   * If a publication already exists, make it
   * unavailable while changes are being made.
   */
  const version =
    note?.fields?.Version || 1;

  const existingPublication =
    await findPublicationForNote(
      resolvedNoteId,
      version
    );

  if (existingPublication) {
    await airtableUpdate(
      PUBLICATIONS_TABLE,
      existingPublication.id,
      {
        Status:
          "Unpublished",
      }
    );
  }

  const updatedNote =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      {
        Status:
          "Changes Requested",
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
      body =
        await readBody(req);
    } catch {
      return sendJson(res, 400, {
        ok: false,
        success: false,
        error:
          "Invalid JSON body",
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
  if (
    req.method === "GET"
  ) {
    authenticatedUser =
      requireRole(
        req,
        res,
        [
          "reviewer",
          "admin",
        ]
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
        [
          "reviewer",
          "admin",
        ]
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
        [
          "reviewer",
          "admin",
        ]
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
        [
          "teacher",
          "admin",
        ]
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
    if (
      req.method === "GET"
    ) {
      const noteId =
        getNoteId(
          req,
          body
        );

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
        return listClasses(
          res
        );
      }

      if (
        list === "review" ||
        list === "queue" ||
        !list
      ) {
        return listReviewQueue(
          res
        );
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
    if (
      action === "save"
    ) {
      return saveDraft(
        res,
        body,
        authenticatedUser
      );
    }

    /*
     * Teacher submits note for review.
     */
    if (
      action === "submit"
    ) {
      return submitForReview(
        res,
        body,
        authenticatedUser
      );
    }

    /*
     * Reviewer approves and publishes.
     */
    if (
      action === "approve"
    ) {
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
      error:
        "Unsupported action",
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