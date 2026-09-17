import {
  requireRole,
} from "./lib/_auth.js";

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

function getRecordId(req, body) {
  return String(
    body?.recordId ||
      body?.record_id ||
      req.query?.recordId ||
      req.query?.record_id ||
      ""
  ).trim();
}

function getText(body, ...keys) {
  for (const key of keys) {
    if (
      body?.[key] !== undefined &&
      body?.[key] !== null
    ) {
      return String(body[key]).trim();
    }
  }

  return "";
}

function getOptionalValue(body, ...keys) {
  for (const key of keys) {
    if (
      body?.[key] !== undefined &&
      body?.[key] !== null &&
      String(body[key]).trim() !== ""
    ) {
      return body[key];
    }
  }

  return null;
}

async function findNote(noteId) {
  if (!noteId) {
    return null;
  }

  try {
    return await airtableGet(
      NOTES_TABLE,
      noteId
    );
  } catch {
    return null;
  }
}

async function findApprovalForNote(noteId) {
  if (!noteId) {
    return null;
  }

  const formula =
    `OR({Note ID}="${noteId}",` +
    `{Note_ID}="${noteId}",` +
    `{noteId}="${noteId}")`;

  const result = await airtableList(
    APPROVALS_TABLE,
    new URLSearchParams({
      filterByFormula: formula,
      maxRecords: "1",
    }).toString()
  );

  return result?.records?.[0] || null;
}

async function findPublicationForNote(noteId) {
  if (!noteId) {
    return null;
  }

  const formula =
    `OR({Note ID}="${noteId}",` +
    `{Note_ID}="${noteId}",` +
    `{noteId}="${noteId}")`;

  const result = await airtableList(
    PUBLICATIONS_TABLE,
    new URLSearchParams({
      filterByFormula: formula,
      maxRecords: "1",
    }).toString()
  );

  return result?.records?.[0] || null;
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

function approvalStatusFromRecord(record) {
  return normalizeStatus(
    firstValue(record, [
      "Status",
      "Review Status",
      "Approval Status",
    ])
  );
}

function publicationStatusFromRecord(record) {
  return normalizeStatus(
    firstValue(record, [
      "Status",
      "Publication Status",
    ])
  );
}

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

  const enriched = await Promise.all(
    records.map(async (record) => {
      const noteId = noteIdFromRecord(record);

      const approval =
        await findApprovalForNote(noteId);

      const publication =
        await findPublicationForNote(noteId);

      return {
        id: record.id,
        noteId,
        fields: record.fields || {},
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
    })
  );

  return sendJson(res, 200, {
    ok: true,
    records: enriched,
  });
}

async function getSingleReview(res, noteId) {
  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      error: "Note not found",
    });
  }

  const approval =
    await findApprovalForNote(noteId);

  const publication =
    await findPublicationForNote(noteId);

  return sendJson(res, 200, {
    ok: true,
    note: {
      id: note.id,
      fields: note.fields || {},
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

async function saveDraft(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
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

  for (const field of allowedFields) {
    if (
      body[field] !== undefined
    ) {
      fields[field] = body[field];
    }
  }

  if (
    Object.keys(fields).length === 0
  ) {
    return sendJson(res, 400, {
      ok: false,
      error: "No editable fields supplied",
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

async function submitForReview(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      error: "Note not found",
    });
  }

  const submittedBy =
    authenticatedUser.teacherId ||
    "";

  const noteFields = {
    Status: "Under Review",
  };

  const updatedNote =
    await airtableUpdate(
      NOTES_TABLE,
      note.id,
      noteFields
    );

  const existingApproval =
    await findApprovalForNote(noteId);

  const approvalFields = {
    Status: "Under Review",
  };

  if (submittedBy) {
    approvalFields.Submitted_By =
      submittedBy;
  }

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
          "Note ID": noteId,
        }
      );
  }

  return sendJson(res, 200, {
    ok: true,
    message:
      "Note submitted for review",
    note: updatedNote,
    approval,
  });
}

async function approveNote(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
      error: "noteId is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
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
      "targetClass"
      "Target Class",
      "class"
    );

  if (!programme) {
    return sendJson(res, 400, {
      ok: false,
      error:
        "Target Programme is required",
    });
  }

  if (!targetClass) {
    return sendJson(res, 400, {
      ok: false,
      error:
        "Target Class is required",
    });
  }

  const approval =
    await findApprovalForNote(noteId);

  const approvalFields = {
    Status: "Approved",
    Decision: "Approved",
  };

  if (reviewerId) {
    approvalFields.Reviewer =
      reviewerId;
  }

  approvalFields.Reviewed_At =
    new Date().toISOString();

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
          "Note ID": noteId,
        }
      );
  }

  const publication =
    await findPublicationForNote(noteId);

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
        {
          ...publicationFields,
          "Note ID": noteId,
        }
      );
  }

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
    message:
      "Note approved and published",
    note: updatedNote,
    approval: savedApproval,
    publication: savedPublication,
  });
}

async function requestChanges(
  res,
  body,
  authenticatedUser
) {
  const noteId = getNoteId(null, body);

  if (!noteId) {
    return sendJson(res, 400, {
      ok: false,
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
      error:
        "A review comment is required",
    });
  }

  const note = await findNote(noteId);

  if (!note) {
    return sendJson(res, 404, {
      ok: false,
      error: "Note not found",
    });
  }

  const reviewerId =
    authenticatedUser.teacherId ||
    null;

  const approval =
    await findApprovalForNote(noteId);

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
          "Note ID": noteId,
        }
      );
  }

  const existingPublication =
    await findPublicationForNote(
      noteId
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
    message:
      "Changes requested",
    note: updatedNote,
    approval: savedApproval,
  });
}

export default async function handler(
  req,
  res
) {
  if (
    !["GET", "POST", "PUT", "PATCH"].includes(
      req.method
    )
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
        error: "Invalid JSON body",
      });
    }
  }

  const action = getAction(req, body);

  let authenticatedUser;

  if (req.method === "GET") {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["reviewer", "admin"]
      );
  } else if (
    action === "approve"
  ) {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["reviewer", "admin"]
      );
  } else if (
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
  } else if (
    ["save", "submit"].includes(
      action
    )
  ) {
    authenticatedUser =
      requireRole(
        req,
        res,
        ["teacher", "admin"]
      );
  } else {
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
        list === "review" ||
        list === "queue" ||
        !list
      ) {
        return listReviewQueue(res);
      }

      return sendJson(res, 400, {
        ok: false,
        error:
          "Unsupported list parameter",
      });
    }

    if (action === "save") {
      return saveDraft(
        res,
        body,
        authenticatedUser
      );
    }

    if (action === "submit") {
      return submitForReview(
        res,
        body,
        authenticatedUser
      );
    }

    if (action === "approve") {
      return approveNote(
        res,
        body,
        authenticatedUser
      );
    }

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
      error: "Unsupported action",
    });
  } catch (error) {
    console.error(
      "NoteBank reviewer API error:",
      error
    );

    return sendJson(res, 500, {
      ok: false,
      error:
        "Unable to process NoteBank review request",
    });
  }
}