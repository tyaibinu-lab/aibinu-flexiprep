import { getConfig } from "./lib/config.js";
import { requireRole } from "./lib/_auth.js";
import { airtableList, airtableCreate, airtableUpdate, airtableDelete } from "./lib/airtable.js";

const config = getConfig();
const A = config.airtable;
const TABLES = {
  academic: process.env.AIRTABLE_ACADEMIC_TABLE || "tbljnjBdJrYr1WXGY",
  classes: process.env.AIRTABLE_CLASSES_TABLE || "tblpwV6RF0IpHGWLg",
  subjects: process.env.AIRTABLE_SUBJECTS_TABLE || "tblQJzVQrpVgbx1j9",
  teachers: A.tables.teachers || process.env.AIRTABLE_TEACHERS_TABLE || "tblVjuSJe4R5kcOZr",
  notes: process.env.AIRTABLE_NOTEBANK_NOTES_TABLE || "tblsEjHgHA7vhPgm0",
  approvals: process.env.AIRTABLE_NOTEBANK_APPROVALS_TABLE || "tblJHGCDxEpdjm46y",
  aiJobs: process.env.AIRTABLE_AI_JOBS_TABLE || "tbldFSYwYcTMtMm9A",
};
const PROGRAMMES = ["WAEC", "NECO", "UTME"];

const clean = (v) => String(v ?? "").trim();
const value = (v) => Array.isArray(v) ? v.map((x) => typeof x === "object" ? x?.name || x?.value || x?.id || "" : x).map(String).map((x) => x.trim()).filter(Boolean).join(", ") : (v && typeof v === "object" ? clean(v.name || v.value || v.id) : clean(v));
const isRecordId = (v) => /^rec[a-zA-Z0-9]+$/.test(clean(v));
const json = (res, status, payload) => { res.statusCode = status; res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(payload)); };

async function listAll(table) {
  const records = [];
  let offset = "";
  do {
    const q = new URLSearchParams({ pageSize: "100" });
    if (offset) q.set("offset", offset);
    const data = await airtableList(table, q.toString());
    records.push(...(data?.records || []));
    offset = data?.offset || "";
  } while (offset);
  return records;
}

function mapClass(r) { const f = r.fields || {}; return { id: r.id, recordId: r.id, airtableId: r.id, type: "Class", name: value(f["Class Name"] ?? f.Level ?? f.Name ?? f.Class), code: value(f["Class ID"] ?? f.Code), programme: value(f.Programme), level: value(f.Level ?? f["Class Name"]), capacity: f.Capacity ?? "", teacher: value(f["Class Teacher"]), status: value(f.Status) || "Active" }; }
function mapSubject(r) { const f = r.fields || {}; return { id: r.id, recordId: r.id, airtableId: r.id, type: "Subject", name: value(f["Subject Name"] ?? f.Name ?? f.Subject), code: value(f["Subject Code"] ?? f["Subject ID"] ?? f.Code), programme: value(f.Programme), status: value(f.Status) || "Active", notes: value(f.Notes) }; }
function mapTeacher(r) { const f = r.fields || {}; return { id: r.id, recordId: r.id, airtableId: r.id, type: "Teacher", name: value(f["Full Name"] ?? f["Teacher Name"] ?? f.Name ?? f.Teacher), code: value(f["Teacher ID"] ?? f.Code), subject: value(f.Subjects ?? f.Subject), status: value(f["Employment Status"] ?? f.Status) || "Active", notes: value(f.Notes) }; }
function mapAcademic(r) { const f = r.fields || {}; return { id: r.id, recordId: r.id, airtableId: r.id, type: value(f.Type), name: value(f.Name), code: value(f.Code), programme: value(f.Programme), className: value(f.Class ?? f["Class Name"]), subject: value(f.Subject), teacher: value(f.Teacher ?? f["Teacher Name"]), status: value(f.Status) || "Active", notes: value(f.Notes ?? f.Description) }; }
function programmes() { return PROGRAMMES.map((p) => ({ id: `programme-${p.toLowerCase()}`, recordId: `programme-${p.toLowerCase()}`, airtableId: `programme-${p.toLowerCase()}`, type: "Programme", name: p, code: p, programme: p, status: "Active" })); }

async function resolveId(table, input, fields, label) {
  const needle = clean(input); if (!needle) throw new Error(`${label} is required.`); if (isRecordId(needle)) return needle;
  const rows = await listAll(table); const found = rows.find((r) => fields.some((f) => value(r.fields?.[f]).toLowerCase() === needle.toLowerCase()));
  if (!found) throw new Error(`${label} "${needle}" was not found.`); return found.id;
}

async function stats() {
  const [notes, approvals, jobs] = await Promise.all([listAll(TABLES.notes), listAll(TABLES.approvals), listAll(TABLES.aiJobs)]);
  const status = (r) => value(r.fields?.Status).toLowerCase();
  const noteDrafts = notes.filter((r) => ["ai draft", "draft", "changes requested"].includes(status(r))).length;
  const published = notes.filter((r) => status(r) === "published").length;
  const pendingReview = approvals.filter((r) => ["pending", "submitted", "under review", "pending review"].includes(status(r))).length;
  const generated = jobs.filter((r) => status(r) === "generated");
  const aiQuestionJobs = generated.filter((r) => value(r.fields?.["Content Type"]).toLowerCase() === "question").length;
  return { success: true, draftContent: noteDrafts + aiQuestionJobs, draftNotes: noteDrafts + aiQuestionJobs, noteDrafts, draftQuestions: aiQuestionJobs, pendingReview, published, aiJobs: jobs.length, generatedAIJobs: generated.length, generatedAt: new Date().toISOString() };
}

async function body(req) {
  if (req.body && typeof req.body === "object") return req.body;
  if (typeof req.body === "string") return JSON.parse(req.body || "{}");
  return await new Promise((resolve, reject) => { let raw = ""; req.on("data", (c) => { raw += c; }); req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch { reject(new Error("Invalid JSON request body.")); } }); req.on("error", reject); });
}

export default async function handler(req, res) {
  if (!["GET", "POST", "PATCH", "PUT", "DELETE"].includes(req.method)) return json(res, 405, { success: false, error: "Method not allowed." });
  if (!requireRole(req, res, ["teacher", "admin"])) return;
  try {
    if (req.method === "GET" && String(req.query?.stats || "") === "1") return json(res, 200, await stats());
    if (req.method === "GET") {
      const [academic, classes, subjects, teachers] = await Promise.all([listAll(TABLES.academic), listAll(TABLES.classes), listAll(TABLES.subjects), listAll(TABLES.teachers)]);
      return json(res, 200, { success: true, records: [...programmes(), ...academic.map(mapAcademic), ...classes.map(mapClass), ...subjects.map(mapSubject), ...teachers.map(mapTeacher)] });
    }
    const b = await body(req); const type = clean(b.type);
    if (req.method === "POST") {
      if (!type) return json(res, 400, { success: false, error: "Record type is required." });
      if (type === "Programme") return json(res, 400, { success: false, error: "Programmes are system-defined: WAEC, NECO and UTME." });
      if (type === "Class") { const name = clean(b.className || b.name || b.level); if (!name) return json(res, 400, { success: false, error: "Class name is required." }); const r = await airtableCreate(TABLES.classes, { "Class Name": name, Level: clean(b.level) || name, "Class ID": clean(b.code) || `CLS-${Date.now()}`, Status: clean(b.status) || "Active" }); return json(res, 201, { success: true, record: mapClass(r) }); }
      if (type === "Subject") { const name = clean(b.name || b.subject); if (!name) return json(res, 400, { success: false, error: "Subject name is required." }); const r = await airtableCreate(TABLES.subjects, { "Subject Name": name, "Subject Code": clean(b.code) || `SUB-${Date.now()}`, Status: clean(b.status) || "Active" }); return json(res, 201, { success: true, record: mapSubject(r) }); }
      if (type === "Teacher") { const name = clean(b.name || b.teacher); if (!name) return json(res, 400, { success: false, error: "Teacher name is required." }); const r = await airtableCreate(TABLES.teachers, { "Full Name": name, "Teacher ID": clean(b.code) || `TCH-${Date.now()}`, "Employment Status": clean(b.status) || "Active", Notes: clean(b.notes) }); return json(res, 201, { success: true, record: mapTeacher(r) }); }
      if (type === "Assignment") { const programme = clean(b.programme).toUpperCase(); if (!PROGRAMMES.includes(programme)) return json(res, 400, { success: false, error: "A valid programme (WAEC, NECO or UTME) is required." }); const [classId, subjectId, teacherId] = await Promise.all([resolveId(TABLES.classes, b.className || b.class, ["Class Name", "Class ID", "Level"], "Class"), resolveId(TABLES.subjects, b.subject, ["Subject Name", "Subject Code", "Subject ID"], "Subject"), resolveId(TABLES.teachers, b.teacher, ["Full Name", "Teacher ID", "Teacher Name"], "Teacher")]); const r = await airtableCreate(TABLES.academic, { Type: "Assignment", Name: clean(b.name) || `${b.className} - ${b.subject}`, Code: clean(b.code) || `ASN-${Date.now()}`, Programme: programme, Class: [classId], Subject: [subjectId], Teacher: [teacherId], Status: clean(b.status) || "Active", Notes: clean(b.notes) }); return json(res, 201, { success: true, record: mapAcademic(r) }); }
      return json(res, 400, { success: false, error: `Unsupported record type: ${type}` });
    }
    const id = clean(b.airtableId || b.recordId || b.id); if (!isRecordId(id)) return json(res, 400, { success: false, error: "A valid Airtable record ID is required." });
    if (req.method === "DELETE") { const table = { Class: TABLES.classes, Subject: TABLES.subjects, Teacher: TABLES.teachers, Assignment: TABLES.academic }[type]; if (!table || type === "Programme") return json(res, 400, { success: false, error: "Unsupported or protected record type." }); await airtableDelete(table, id); return json(res, 200, { success: true, deleted: true, recordId: id, type }); }
    if (type === "Programme") return json(res, 400, { success: false, error: "Programmes are system-defined and cannot be edited." });
    if (type === "Class") { const fields = {}; if (b.name != null || b.className != null || b.level != null) fields["Class Name"] = clean(b.name || b.className || b.level); if (b.code != null) fields["Class ID"] = clean(b.code); if (b.status != null) fields.Status = clean(b.status); const r = await airtableUpdate(TABLES.classes, id, fields); return json(res, 200, { success: true, record: mapClass(r) }); }
    if (type === "Subject") { const fields = {}; if (b.name != null || b.subject != null) fields["Subject Name"] = clean(b.name || b.subject); if (b.code != null) fields["Subject Code"] = clean(b.code); if (b.status != null) fields.Status = clean(b.status); const r = await airtableUpdate(TABLES.subjects, id, fields); return json(res, 200, { success: true, record: mapSubject(r) }); }
    if (type === "Teacher") { const fields = {}; if (b.name != null || b.teacher != null) fields["Full Name"] = clean(b.name || b.teacher); if (b.code != null) fields["Teacher ID"] = clean(b.code); if (b.status != null) fields["Employment Status"] = clean(b.status); if (b.notes != null) fields.Notes = clean(b.notes); const r = await airtableUpdate(TABLES.teachers, id, fields); return json(res, 200, { success: true, record: mapTeacher(r) }); }
    if (type === "Assignment") { const fields = {}; if (b.name != null) fields.Name = clean(b.name); if (b.code != null) fields.Code = clean(b.code); if (b.status != null) fields.Status = clean(b.status); if (b.notes != null) fields.Notes = clean(b.notes); if (b.programme != null) { const p = clean(b.programme).toUpperCase(); if (!PROGRAMMES.includes(p)) return json(res, 400, { success: false, error: "Programme must be WAEC, NECO or UTME." }); fields.Programme = p; } if (b.className != null || b.class != null) fields.Class = [await resolveId(TABLES.classes, b.className || b.class, ["Class Name", "Class ID", "Level"], "Class")]; if (b.subject != null) fields.Subject = [await resolveId(TABLES.subjects, b.subject, ["Subject Name", "Subject Code", "Subject ID"], "Subject")]; if (b.teacher != null) fields.Teacher = [await resolveId(TABLES.teachers, b.teacher, ["Full Name", "Teacher ID", "Teacher Name"], "Teacher")]; const r = await airtableUpdate(TABLES.academic, id, fields); return json(res, 200, { success: true, record: mapAcademic(r) }); }
    return json(res, 400, { success: false, error: `Unsupported record type: ${type}` });
  } catch (error) { console.error("Academic API error:", error); return json(res, error.status === 401 ? 401 : 500, { success: false, error: error?.message || "Academic Management request failed." }); }
}
