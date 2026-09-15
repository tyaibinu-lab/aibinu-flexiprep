import { useEffect, useMemo, useState } from "react";

const PROGRAMMES = ["WAEC", "NECO", "UTME"];
const SUBJECTS = ["Physics", "Chemistry", "Biology", "Mathematics", "English"];
const CLASSES = ["SS1", "SS2", "SS3"];
const EXAMS = ["WAEC", "NECO", "UTME"];

async function readJson(response) {
  const text = await response.text();
  let data = {};
  try { data = text ? JSON.parse(text) : {}; } catch { throw new Error("Server returned invalid JSON."); }
  if (!response.ok) throw new Error(data?.error || data?.message || `Request failed (${response.status})`);
  return data;
}

function cleanRecords(data) {
  return (Array.isArray(data) ? data : []).filter((r) => r?.type && (r.type === "Assignment" ? r.className && r.subject && r.teacher : String(r.name || "").trim()));
}

function displayName(r) {
  return r.type === "Assignment" ? [r.className, r.subject, r.teacher].filter(Boolean).join(" — ") : r.name || "";
}

function unique(records, type) {
  const seen = new Set();
  return records
    .filter((r) => r.type === type && r.status !== "Inactive" && String(r.name || "").trim())
    .filter((r) => { const key = r.name.trim().toLowerCase(); if (seen.has(key)) return false; seen.add(key); return true; })
    .sort((a, b) => a.name.localeCompare(b.name));
}

const noteFields = [
  ["title", "Title", 2], ["learningObjectives", "Learning Objectives", 5], ["keyTerms", "Key Terms", 4],
  ["content", "Main Content", 12], ["examples", "Examples", 6], ["workedExamples", "Worked Examples", 8],
  ["formulae", "Formulae", 4], ["applications", "Applications", 4], ["commonMisconceptions", "Common Misconceptions", 4],
  ["summary", "Summary", 4], ["examTips", "Examination Tips", 4], ["waecFocus", "WAEC Focus", 4],
  ["necoFocus", "NECO Focus", 4], ["utmeFocus", "UTME Focus", 4], ["diagrams", "Diagrams", 4],
];

function normaliseNote(n) {
  const get = (a, b) => n?.[a] ?? n?.[b] ?? "";
  return {
    title: get("title", "Title"), learningObjectives: get("learningObjectives", "Learning Objectives"), keyTerms: get("keyTerms", "Key Terms"),
    content: get("content", "Content"), examples: get("examples", "Examples"), workedExamples: get("workedExamples", "Worked Examples"),
    formulae: get("formulae", "Formulae"), applications: get("applications", "Applications"), commonMisconceptions: get("commonMisconceptions", "Common Misconceptions"),
    summary: get("summary", "Summary"), examTips: get("examTips", "Exam Tips"), waecFocus: get("waecFocus", "WAEC Focus"),
    necoFocus: get("necoFocus", "NECO Focus"), utmeFocus: get("utmeFocus", "UTME Focus"), diagrams: get("diagrams", "Diagrams"),
    visualComponents: n?.visualComponents ?? n?.["Visual Components"] ?? [],
  };
}

export default function AcademicManagement() {
  const [records, setRecords] = useState([]);
  const [stats, setStats] = useState({ draftContent: 0, pendingReview: 0, published: 0, aiJobs: 0 });
  const [tab, setTab] = useState("All");
  const [search, setSearch] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [modal, setModal] = useState(null);
  const [form, setForm] = useState({ type: "Programme", name: "", code: "", programme: "", className: "", subject: "", teacher: "", status: "Active", notes: "" });
  const [aiTab, setAiTab] = useState("note");
  const [noteForm, setNoteForm] = useState({ subject: "", className: "", programme: "", topic: "", prompt: "", exams: ["WAEC", "NECO", "UTME"] });
  const [questionForm, setQuestionForm] = useState({ subject: "", className: "", programme: "", topic: "", count: 20, difficulty: "Mixed", bloomLevel: "Mixed", questionType: "MCQ", prompt: "", exams: ["WAEC", "NECO", "UTME"] });
  const [aiResult, setAiResult] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [editingNote, setEditingNote] = useState(false);
  const [editedNote, setEditedNote] = useState(null);

  const load = async () => {
    setError("");
    try {
      const [r, s] = await Promise.all([fetch("/api/academic", { cache: "no-store" }), fetch("/api/academic?stats=1", { cache: "no-store" })]);
      const d = await readJson(r); const st = await readJson(s);
      setRecords(cleanRecords(d.records)); setStats(st);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => (tab === "All" || r.type === tab) && (!q || `${r.type} ${r.name} ${r.code} ${r.programme} ${r.className} ${r.subject} ${r.teacher}`.toLowerCase().includes(q)));
  }, [records, search, tab]);

  const counts = useMemo(() => Object.fromEntries(["Programme", "Class", "Subject", "Teacher", "Assignment"].map((t) => [t, records.filter((r) => r.type === t).length])), [records]);

  const setF = (key, value) => setForm((x) => ({ ...x, [key]: value }));
  const openCreate = () => { setForm({ type: "Programme", name: "", code: "", programme: "", className: "", subject: "", teacher: "", status: "Active", notes: "" }); setModal("create"); };
  const openEdit = (r) => { setForm({ type: r.type, name: r.name || "", code: r.code || "", programme: r.programme || "", className: r.className || "", subject: r.subject || "", teacher: r.teacher || "", status: r.status || "Active", notes: r.notes || "", airtableId: r.airtableId || r.recordId || r.id }); setModal("edit"); };

  const saveAcademic = async (e) => {
    e.preventDefault(); setMessage(""); setError("");
    try {
      const payload = { ...form };
      if (modal === "edit") payload.airtableId = form.airtableId;
      const d = await readJson(await fetch("/api/academic", { method: modal === "edit" ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setModal(null); setMessage(d.message || "Academic record saved successfully."); await load();
    } catch (e) { setError(e.message); }
  };

  const toggleExam = (setter, key, value) => setter((x) => ({ ...x, [key]: x[key].includes(value) ? x[key].filter((v) => v !== value) : [...x[key], value] }));

  const generateNote = async () => {
    if (!noteForm.subject || !noteForm.className || !noteForm.topic || !noteForm.prompt) return setError("Select Subject and Class, enter Topic and a teacher instruction.");
    setGenerating(true); setError(""); setMessage("");
    try {
      const payload = { contentType: "Note", subject: noteForm.subject, className: noteForm.className, programme: noteForm.programme, topic: noteForm.topic, examTypes: noteForm.exams.length ? noteForm.exams : EXAMS, teacherPrompt: noteForm.prompt, systemContext: `Create academic content for Aibinu Flexiprep Educonsult. Subject: ${noteForm.subject}. Class: ${noteForm.className}. Programme: ${noteForm.programme || "General"}. Topic: ${noteForm.topic}. Examination focus: ${(noteForm.exams.length ? noteForm.exams : EXAMS).join(", ")}. Return a teacher-review draft. Do not publish.` };
      const d = await readJson(await fetch("/api/ai-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setAiResult({ type: "Note", note: d.note, raw: d }); setEditedNote(normaliseNote(d.note)); setMessage("AI note generated successfully as DRAFT."); await load();
    } catch (e) { setError(e.message); } finally { setGenerating(false); }
  };

  const generateQuestions = async () => {
    if (!questionForm.subject || !questionForm.className || !questionForm.topic || !questionForm.prompt) return setError("Select Subject and Class, enter Topic and a teacher instruction.");
    setGenerating(true); setError(""); setMessage("");
    try {
      const count = Math.max(1, Math.min(100, Number(questionForm.count) || 1));
      const payload = { contentType: "Question", subject: questionForm.subject, className: questionForm.className, programme: questionForm.programme, topic: questionForm.topic, examTypes: questionForm.exams.length ? questionForm.exams : EXAMS, questionCount: count, difficulty: questionForm.difficulty, bloomLevel: questionForm.bloomLevel, questionType: questionForm.questionType, teacherPrompt: questionForm.prompt, systemContext: `Create examination-style questions for Aibinu Flexiprep Educonsult. Subject: ${questionForm.subject}. Class: ${questionForm.className}. Programme: ${questionForm.programme || "General"}. Topic: ${questionForm.topic}. Number: ${count}. Difficulty: ${questionForm.difficulty}. Bloom: ${questionForm.bloomLevel}. Type: ${questionForm.questionType}. Return questions for teacher review. Do not approve or publish.` };
      const d = await readJson(await fetch("/api/ai-content", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }));
      setAiResult({ type: "Question", questions: Array.isArray(d.questions) ? d.questions : [], raw: d }); setMessage(`${Array.isArray(d.questions) ? d.questions.length : 0} AI questions generated successfully as DRAFT.`); await load();
    } catch (e) { setError(e.message); } finally { setGenerating(false); }
  };

  const saveNote = async (submit = false) => {
    if (!aiResult?.note) return setError("Generate a note draft first.");
    const id = aiResult.note?.["Note ID"] || aiResult.note?.noteId || aiResult.note?.airtableId || aiResult.note?.id;
    if (!id) return setError("The Note ID could not be found.");
    try {
      const fields = { noteId: id, action: "save", Title: editedNote.title, "Learning Objectives": editedNote.learningObjectives, "Key Terms": editedNote.keyTerms, Content: editedNote.content, Examples: editedNote.examples, "Worked Examples": editedNote.workedExamples, Formulae: editedNote.formulae, Applications: editedNote.applications, "Common Misconceptions": editedNote.commonMisconceptions, Summary: editedNote.summary, "Exam Tips": editedNote.examTips, "WAEC Focus": editedNote.waecFocus, "NECO Focus": editedNote.necoFocus, "UTME Focus": editedNote.utmeFocus, Diagrams: editedNote.diagrams, "Visual Components": JSON.stringify(Array.isArray(editedNote.visualComponents) ? editedNote.visualComponents : []) };
      await readJson(await fetch("/api/note-reviews", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(fields) }));
      if (submit) await readJson(await fetch("/api/note-reviews", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ noteId: id, action: "submit" }) }));
      setAiResult((x) => ({ ...x, note: { ...x.note, ...editedNote, status: submit ? "Under Review" : x.note.status } })); setEditingNote(false); setMessage(submit ? "Note submitted for approval." : "Note draft saved successfully."); await load();
    } catch (e) { setError(e.message); }
  };

  return (
    <main style={styles.page}>
      <div style={styles.header}><div><div style={styles.kicker}>AIBINU FLEXIPREP</div><h1 style={styles.h1}>Academic Management</h1><p style={styles.muted}>Programmes, classes, subjects, teachers, assignments and NoteBank.</p></div><button style={styles.primary} onClick={openCreate}>+ Add Record</button></div>
      {(message || error) && <div style={{ ...styles.alert, ...(error ? styles.error : styles.success) }}>{error || message}</div>}
      <div style={styles.cards}>{[["Programmes", counts.Programme], ["Classes", counts.Class], ["Subjects", counts.Subject], ["Teachers", counts.Teacher], ["Assignments", counts.Assignment]].map(([label, value]) => <div style={styles.card} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
      <section style={styles.panel}>
        <div style={styles.tabs}>{["All", "Programme", "Class", "Subject", "Teacher", "Assignment", "NoteBank"].map((t) => <button key={t} style={tab === t ? styles.tabActive : styles.tab} onClick={() => setTab(t)}>{t === "NoteBank" ? "📚 NoteBank" : t === "All" ? "All" : `${t}${t.endsWith("e") ? "s" : "s"}`}</button>)}</div>
        {tab !== "NoteBank" ? <>
          <div style={styles.toolbar}><input style={styles.input} value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search academic records..." /><button style={styles.secondary} onClick={load}>↻ Refresh</button></div>
          <div style={{ overflowX: "auto" }}><table style={styles.table}><thead><tr>{["Type", "Name", "Code", "Programme", "Class", "Subject", "Teacher", "Status", ""].map((x) => <th style={styles.th} key={x}>{x}</th>)}</tr></thead><tbody>{filtered.map((r) => <tr key={r.airtableId || r.id}><td style={styles.td}>{r.type}</td><td style={styles.td}><b>{displayName(r)}</b></td><td style={styles.td}>{r.code}</td><td style={styles.td}>{r.programme}</td><td style={styles.td}>{r.className}</td><td style={styles.td}>{r.subject}</td><td style={styles.td}>{r.teacher}</td><td style={styles.td}><span style={styles.badge}>{r.status || "Active"}</span></td><td style={styles.td}><button style={styles.small} onClick={() => openEdit(r)}>Edit</button></td></tr>)}</tbody></table>{!filtered.length && <p style={styles.empty}>No academic records found.</p>}</div>
        </> : <div>
          <div style={styles.statStrip}>{[["Draft Content", stats.draftContent], ["Pending Review", stats.pendingReview], ["Published", stats.published], ["AI Jobs", stats.aiJobs]].map(([label, value]) => <div style={styles.mini} key={label}><span>{label}</span><strong>{value}</strong></div>)}</div>
          <div style={styles.tabs}><button style={aiTab === "note" ? styles.tabActive : styles.tab} onClick={() => setAiTab("note")}>✨ AI Note Creator</button><button style={aiTab === "question" ? styles.tabActive : styles.tab} onClick={() => setAiTab("question")}>✨ AI Question Generator</button></div>
          {aiTab === "note" ? <>
            <h2>AI Note Creator</h2><p style={styles.muted}>Generate a teacher-review draft using the academic context and your instruction.</p>
            <div style={styles.formGrid}>{[["Subject", "subject", SUBJECTS], ["Class", "className", CLASSES], ["Programme", "programme", ["", ...PROGRAMMES]]].map(([label, key, options]) => <label style={styles.label} key={key}>{label}<select style={styles.input} value={noteForm[key]} onChange={(e) => setNoteForm((x) => ({ ...x, [key]: e.target.value }))}><option value="">Select {label.toLowerCase()}</option>{options.filter(Boolean).map((o) => <option key={o}>{o}</option>)}</select></label>)}<label style={styles.label}>Topic<input style={styles.input} value={noteForm.topic} onChange={(e) => setNoteForm((x) => ({ ...x, topic: e.target.value }))} placeholder="e.g. Uniformly Accelerated Motion" /></label><div style={styles.full}><b>Examination Focus</b><div style={styles.checks}>{EXAMS.map((e) => <label key={e}><input type="checkbox" checked={noteForm.exams.includes(e)} onChange={() => toggleExam(setNoteForm, "exams", e)} /> {e}</label>)}</div></div><label style={styles.full}>Teacher Instruction<textarea style={styles.textarea} value={noteForm.prompt} onChange={(e) => setNoteForm((x) => ({ ...x, prompt: e.target.value }))} placeholder="Tell the AI exactly how you want the note prepared." /></label><div style={styles.full}><button style={styles.primary} disabled={generating} onClick={generateNote}>{generating ? "⏳ Generating..." : "✨ Generate Note Draft"}</button></div></div>
            {aiResult?.type === "Note" && <div style={styles.result}><div style={styles.status}>AI output remains <b>{aiResult.note?.status || "DRAFT"}</b> until reviewed.</div><h3>{normaliseNote(aiResult.note).title}</h3><pre style={styles.preview}>{JSON.stringify(normaliseNote(aiResult.note), null, 2)}</pre><div style={styles.actions}><button style={styles.secondary} onClick={() => { setEditedNote(normaliseNote(aiResult.note)); setEditingNote(true); }}>Edit Draft</button><button style={styles.primary} onClick={() => saveNote(true)}>📤 Submit for Approval</button></div>{editingNote && editedNote && <div style={styles.editor}><h3>Edit Note Draft</h3>{noteFields.map(([key, label, rows]) => <label style={styles.label} key={key}>{label}{key === "title" ? <input style={styles.input} value={editedNote[key]} onChange={(e) => setEditedNote((x) => ({ ...x, [key]: e.target.value }))} /> : <textarea style={styles.textarea} rows={rows} value={editedNote[key]} onChange={(e) => setEditedNote((x) => ({ ...x, [key]: e.target.value }))} />}</label>)}<div style={styles.actions}><button style={styles.secondary} onClick={() => setEditingNote(false)}>Cancel</button><button style={styles.secondary} onClick={() => saveNote(false)}>💾 Save Draft</button><button style={styles.primary} onClick={() => saveNote(true)}>📤 Save & Submit</button></div></div>}</div>}
          </> : <>
            <h2>AI Question Generator</h2><p style={styles.muted}>Generate examination-style questions for teacher review.</p>
            <div style={styles.formGrid}>{[["Subject", "subject", SUBJECTS], ["Class", "className", CLASSES], ["Programme", "programme", PROGRAMMES]].map(([label, key, options]) => <label style={styles.label} key={key}>{label}<select style={styles.input} value={questionForm[key]} onChange={(e) => setQuestionForm((x) => ({ ...x, [key]: e.target.value }))}><option value="">Select {label.toLowerCase()}</option>{options.map((o) => <option key={o}>{o}</option>)}</select></label>)}<label style={styles.label}>Topic<input style={styles.input} value={questionForm.topic} onChange={(e) => setQuestionForm((x) => ({ ...x, topic: e.target.value }))} /></label><label style={styles.label}>Number<input style={styles.input} type="number" min="1" max="100" value={questionForm.count} onChange={(e) => setQuestionForm((x) => ({ ...x, count: e.target.value }))} /></label><label style={styles.label}>Difficulty<select style={styles.input} value={questionForm.difficulty} onChange={(e) => setQuestionForm((x) => ({ ...x, difficulty: e.target.value }))}>{["Mixed", "Easy", "Medium", "Hard"].map((o) => <option key={o}>{o}</option>)}</select></label><label style={styles.label}>Bloom Level<select style={styles.input} value={questionForm.bloomLevel} onChange={(e) => setQuestionForm((x) => ({ ...x, bloomLevel: e.target.value }))}>{["Mixed", "Remember", "Understand", "Apply", "Analyze", "Evaluate", "Create"].map((o) => <option key={o}>{o}</option>)}</select></label><label style={styles.label}>Question Type<select style={styles.input} value={questionForm.questionType} onChange={(e) => setQuestionForm((x) => ({ ...x, questionType: e.target.value }))}>{["MCQ", "Calculation", "Conceptual", "Mixed"].map((o) => <option key={o}>{o}</option>)}</select></label><div style={styles.full}><b>Examination Focus</b><div style={styles.checks}>{EXAMS.map((e) => <label key={e}><input type="checkbox" checked={questionForm.exams.includes(e)} onChange={() => toggleExam(setQuestionForm, "exams", e)} /> {e}</label>)}</div></div><label style={styles.full}>Teacher Instruction<textarea style={styles.textarea} value={questionForm.prompt} onChange={(e) => setQuestionForm((x) => ({ ...x, prompt: e.target.value }))} placeholder="Example: Generate challenging calculation questions for strong SS2 students." /></label><div style={styles.full}><button style={styles.primary} disabled={generating} onClick={generateQuestions}>{generating ? "⏳ Generating..." : "✨ Generate Question Draft"}</button></div></div>
            {aiResult?.type === "Question" && <div style={styles.result}><div style={styles.status}>{aiResult.questions.length} question(s) generated as <b>DRAFT</b>.</div>{aiResult.questions.map((q, i) => <div style={styles.question} key={i}><b>Question {i + 1}</b><p>{q.question}</p><div>A. {q.optionA}</div><div>B. {q.optionB}</div><div>C. {q.optionC}</div><div>D. {q.optionD}</div><small>Difficulty: {q.difficulty || ""} · Bloom: {q.bloomLevel || ""}</small><p>{q.explanation || ""}</p></div>)}<p style={styles.muted}>Questions remain DRAFT. Use the existing question-review workflow before publishing to CBT.</p></div>}
          </>}
        </div>}
      </section>
      {modal && <div style={styles.overlay} onMouseDown={(e) => e.target === e.currentTarget && setModal(null)}><form style={styles.modal} onSubmit={saveAcademic}><h2>{modal === "edit" ? "Edit Academic Record" : "Add Academic Record"}</h2><div style={styles.formGrid}><label style={styles.label}>Record Type<select style={styles.input} value={form.type} disabled={modal === "edit"} onChange={(e) => setF("type", e.target.value)}>{["Programme", "Class", "Subject", "Teacher", "Assignment"].map((o) => <option key={o}>{o}</option>)}</select></label>{form.type !== "Assignment" && <label style={styles.label}>Name<input style={styles.input} required value={form.name} onChange={(e) => setF("name", e.target.value)} /></label>}<label style={styles.label}>Code<input style={styles.input} value={form.code} onChange={(e) => setF("code", e.target.value)} /></label>{form.type === "Assignment" && <><label style={styles.label}>Programme<select style={styles.input} required value={form.programme} onChange={(e) => setF("programme", e.target.value)}><option value="">Select programme</option>{PROGRAMMES.map((x) => <option key={x}>{x}</option>)}</select></label><label style={styles.label}>Class<select style={styles.input} required value={form.className} onChange={(e) => setF("className", e.target.value)}><option value="">Select class</option>{unique(records, "Class").map((x) => <option key={x.id}>{x.name}</option>)}</select></label><label style={styles.label}>Subject<select style={styles.input} required value={form.subject} onChange={(e) => setF("subject", e.target.value)}><option value="">Select subject</option>{unique(records, "Subject").map((x) => <option key={x.id}>{x.name}</option>)}</select></label><label style={styles.label}>Teacher<select style={styles.input} required value={form.teacher} onChange={(e) => setF("teacher", e.target.value)}><option value="">Select teacher</option>{unique(records, "Teacher").map((x) => <option key={x.id}>{x.name}</option>)}</select></label></>}<label style={styles.label}>Status<select style={styles.input} value={form.status} onChange={(e) => setF("status", e.target.value)}><option>Active</option><option>Inactive</option></select></label><label style={styles.full}>Notes<textarea style={styles.textarea} rows="4" value={form.notes} onChange={(e) => setF("notes", e.target.value)} /></label></div><div style={styles.actions}><button type="button" style={styles.secondary} onClick={() => setModal(null)}>Cancel</button><button type="submit" style={styles.primary}>Save Record</button></div></form></div>}
    </main>
  );
}

const styles = {
  page: { maxWidth: 1240, margin: "0 auto", padding: "28px 18px", color: "#17382b", fontFamily: "Arial, sans-serif" },
  header: { display: "flex", justifyContent: "space-between", alignItems: "end", gap: 20, flexWrap: "wrap" }, kicker: { fontSize: 12, fontWeight: 800, letterSpacing: 1 }, h1: { margin: "5px 0", fontSize: 38 }, muted: { color: "#65736c", lineHeight: 1.5 },
  cards: { display: "grid", gridTemplateColumns: "repeat(5,minmax(0,1fr))", gap: 12, margin: "22px 0" }, card: { background: "#fff", border: "1px solid #dfe7e2", borderRadius: 16, padding: 18 },
  panel: { background: "#fff", border: "1px solid #dfe7e2", borderRadius: 18, padding: 18 }, tabs: { display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }, tab: { border: "1px solid #dfe7e2", background: "#fff", color: "#08783f", borderRadius: 10, padding: "10px 13px", fontWeight: 700 }, tabActive: { border: "1px solid #08783f", background: "#08783f", color: "#fff", borderRadius: 10, padding: "10px 13px", fontWeight: 700 },
  toolbar: { display: "flex", gap: 10, marginBottom: 18 }, input: { width: "100%", padding: "11px 12px", border: "1px solid #ccd8d1", borderRadius: 9, boxSizing: "border-box", background: "#fff" }, textarea: { width: "100%", padding: "11px 12px", border: "1px solid #ccd8d1", borderRadius: 9, boxSizing: "border-box", resize: "vertical", minHeight: 110 },
  primary: { background: "#d7a62a", color: "#17382b", border: 0, borderRadius: 10, padding: "11px 15px", fontWeight: 800, cursor: "pointer" }, secondary: { background: "#fff", color: "#08783f", border: "1px solid #dfe7e2", borderRadius: 10, padding: "11px 15px", fontWeight: 700, cursor: "pointer" }, small: { background: "#fff", color: "#08783f", border: "1px solid #dfe7e2", borderRadius: 8, padding: "7px 10px", fontWeight: 700 },
  table: { width: "100%", borderCollapse: "collapse" }, th: { textAlign: "left", padding: 11, borderBottom: "1px solid #dfe7e2" }, td: { padding: 11, borderBottom: "1px solid #edf1ee", verticalAlign: "top" }, badge: { display: "inline-block", padding: "4px 8px", borderRadius: 999, background: "#e5f5eb", color: "#08783f", fontSize: 12, fontWeight: 700 }, empty: { padding: 20, color: "#65736c" },
  alert: { margin: "14px 0", padding: 11, borderRadius: 9 }, success: { background: "#e5f5eb", color: "#08783f" }, error: { background: "#fde9e7", color: "#b42318" }, statStrip: { display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 10, marginBottom: 18 }, mini: { background: "#f4f8f5", border: "1px solid #dfe7e2", padding: 14, borderRadius: 12 }, formGrid: { display: "grid", gridTemplateColumns: "repeat(2,minmax(0,1fr))", gap: 14 }, label: { display: "grid", gap: 6, fontWeight: 700, fontSize: 14 }, full: { gridColumn: "1 / -1" }, checks: { display: "flex", gap: 18, flexWrap: "wrap", marginTop: 8 }, result: { marginTop: 20, border: "1px solid #dfe7e2", borderRadius: 14, padding: 18, background: "#f8fbf9" }, status: { padding: 12, borderRadius: 10, background: "#fff7df", marginBottom: 14 }, preview: { whiteSpace: "pre-wrap", background: "#fff", border: "1px solid #dfe7e2", padding: 14, borderRadius: 10, maxHeight: 600, overflow: "auto" }, actions: { display: "flex", justifyContent: "flex-end", gap: 10, flexWrap: "wrap", marginTop: 16 }, editor: { marginTop: 18, border: "1px solid #dfe7e2", borderRadius: 14, padding: 18, background: "#fff" }, question: { padding: "14px 0", borderBottom: "1px solid #dfe7e2" }, overlay: { position: "fixed", inset: 0, background: "rgba(0,0,0,.5)", display: "grid", placeItems: "center", padding: 16, zIndex: 50 }, modal: { width: "min(820px,100%)", maxHeight: "92vh", overflow: "auto", background: "#fff", borderRadius: 16, padding: 20 },
};
