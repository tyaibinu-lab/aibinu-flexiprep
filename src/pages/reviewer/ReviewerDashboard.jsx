import { useEffect, useMemo, useState } from "react";

const PROGRAMMES = [
  "WAEC",
  "NECO",
  "UTME",
  "IJMB",
  "JUPEB",
];

function field(note, ...names) {
  for (const name of names) {
    const value = note?.[name];

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

function formatDate(value) {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return date.toLocaleString();
}

export default function ReviewerDashboard() {
  const [notes, setNotes] = useState([]);
  const [classes, setClasses] = useState([]);
  const [selectedNote, setSelectedNote] = useState(null);

  const [targetProgramme, setTargetProgramme] = useState("");
  const [targetClass, setTargetClass] = useState("");
  const [reviewComment, setReviewComment] = useState("");

  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [user, setUser] = useState(null);

  async function loadCurrentUser() {
    const response = await fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    });

    if (!response.ok) {
      throw new Error("Unable to verify reviewer session.");
    }

    const data = await response.json();

    if (!data?.ok || !data?.user) {
      throw new Error("Reviewer session is invalid.");
    }

    setUser(data.user);
  }

  async function loadQueue() {
    const response = await fetch(
      "/api/note-reviews?list=review",
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error ||
          "Unable to load the NoteBank review queue."
      );
    }

    setNotes(
      Array.isArray(data.notes)
        ? data.notes
        : []
    );
  }

  async function loadClasses() {
    const response = await fetch(
      "/api/note-reviews?list=classes",
      {
        method: "GET",
        credentials: "include",
        headers: {
          Accept: "application/json",
        },
      }
    );

    const data = await response.json();

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.error ||
          "Unable to load classes."
      );
    }

    setClasses(
      Array.isArray(data.classes)
        ? data.classes
        : []
    );
  }

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      await Promise.all([
        loadCurrentUser(),
        loadQueue(),
        loadClasses(),
      ]);
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Unable to load Reviewer Portal."
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  function selectNote(note) {
    setSelectedNote(note);

    setTargetProgramme(
      String(
        field(
          note,
          "Target Programme",
          "Programme"
        ) || ""
      )
    );

    const existingClass = field(
      note,
      "Target Class"
    );

    if (Array.isArray(existingClass)) {
      setTargetClass(
        existingClass[0] || ""
      );
    } else {
      setTargetClass(
        String(existingClass || "")
      );
    }

    setReviewComment(
      String(
        field(
          note,
          "Review Comment"
        ) || ""
      )
    );

    setError("");
    setSuccess("");
  }

  function closeReview() {
    if (processing) return;

    setSelectedNote(null);
    setTargetProgramme("");
    setTargetClass("");
    setReviewComment("");
    setError("");
    setSuccess("");
  }

  async function approveAndPublish() {
    if (!selectedNote) {
      setError("Select a note first.");
      return;
    }

    if (!targetProgramme.trim()) {
      setError(
        "Target Programme is required before publication."
      );
      return;
    }

    if (!targetClass.trim()) {
      setError(
        "Target Class is required before publication."
      );
      return;
    }

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/note-reviews",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "approve",
            noteId:
              selectedNote.airtableId ||
              selectedNote["Note ID"],
            targetProgramme:
              targetProgramme.trim(),
            targetClass:
              targetClass.trim(),
            reviewComment:
              reviewComment.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "Unable to approve and publish the note."
        );
      }

      setSuccess(
        data.message ||
          "Note approved and published successfully."
      );

      await loadQueue();

      setSelectedNote(null);
      setTargetProgramme("");
      setTargetClass("");
      setReviewComment("");
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Approval failed."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function requestChanges() {
    if (!selectedNote) {
      setError("Select a note first.");
      return;
    }

    if (!reviewComment.trim()) {
      setError(
        "A review comment is required when requesting changes."
      );
      return;
    }

    setProcessing(true);
    setError("");
    setSuccess("");

    try {
      const response = await fetch(
        "/api/note-reviews",
        {
          method: "POST",
          credentials: "include",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            action: "request_changes",
            noteId:
              selectedNote.airtableId ||
              selectedNote["Note ID"],
            reviewComment:
              reviewComment.trim(),
          }),
        }
      );

      const data = await response.json();

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.error ||
            "Unable to request changes."
        );
      }

      setSuccess(
        data.message ||
          "Changes requested successfully."
      );

      await loadQueue();

      setSelectedNote(null);
      setTargetProgramme("");
      setTargetClass("");
      setReviewComment("");
    } catch (err) {
      console.error(err);

      setError(
        err?.message ||
          "Request for changes failed."
      );
    } finally {
      setProcessing(false);
    }
  }

  async function logout() {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = "/login";
    }
  }

  const sortedClasses = useMemo(() => {
    return [...classes].sort((a, b) =>
      String(a.name || "").localeCompare(
        String(b.name || "")
      )
    );
  }, [classes]);

  if (loading) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>
          <div style={styles.logo}>AF</div>
          <h2>Reviewer Portal</h2>
          <p>
            Loading secure review workspace…
          </p>
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <header style={styles.header}>
        <div>
          <div style={styles.brand}>
            AIBINU FLEXIPREP
          </div>

          <div style={styles.subtitle}>
            NoteBank Reviewer Portal
          </div>
        </div>

        <div style={styles.headerRight}>
          <div style={styles.roleBadge}>
            {user?.role || "reviewer"}
          </div>

          <button
            type="button"
            onClick={logout}
            style={styles.logoutButton}
          >
            Logout
          </button>
        </div>
      </header>

      <section style={styles.container}>
        {error && (
          <div style={styles.error}>
            <strong>Error:</strong> {error}
          </div>
        )}

        {success && (
          <div style={styles.success}>
            {success}
          </div>
        )}

        <section style={styles.summaryGrid}>
          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>
              Pending Review
            </span>

            <strong style={styles.summaryNumber}>
              {notes.length}
            </strong>
          </div>

          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>
              Reviewer
            </span>

            <strong style={styles.summaryValue}>
              {user?.role || "reviewer"}
            </strong>
          </div>

          <div style={styles.summaryCard}>
            <span style={styles.summaryLabel}>
              Available Classes
            </span>

            <strong style={styles.summaryNumber}>
              {classes.length}
            </strong>
          </div>
        </section>

        <section style={styles.workspace}>
          <div style={styles.queuePanel}>
            <div style={styles.panelHeader}>
              <div>
                <h2 style={styles.panelTitle}>
                  Review Queue
                </h2>

                <p style={styles.panelDescription}>
                  Notes currently awaiting human review.
                </p>
              </div>

              <button
                type="button"
                onClick={loadDashboard}
                disabled={loading}
                style={styles.refreshButton}
              >
                Refresh
              </button>
            </div>

            {notes.length === 0 ? (
              <div style={styles.empty}>
                <div style={styles.emptyIcon}>
                  ✓
                </div>

                <h3>
                  Review queue is clear
                </h3>

                <p>
                  There are currently no notes
                  with status “Under Review”.
                </p>
              </div>
            ) : (
              <div style={styles.noteList}>
                {notes.map((note, index) => {
                  const noteId =
                    note.airtableId ||
                    note["Note ID"] ||
                    `note-${index}`;

                  const title =
                    field(
                      note,
                      "Title",
                      "Topic",
                      "Note Title"
                    ) ||
                    "Untitled Note";

                  const subject =
                    field(
                      note,
                      "Subject",
                      "Subject Name"
                    ) ||
                    "Subject not specified";

                  const status =
                    field(
                      note,
                      "Status"
                    ) ||
                    "Under Review";

                  const updated =
                    field(
                      note,
                      "Updated Date",
                      "Created Date"
                    );

                  return (
                    <button
                      key={noteId}
                      type="button"
                      onClick={() =>
                        selectNote(note)
                      }
                      style={{
                        ...styles.noteCard,
                        ...(selectedNote === note
                          ? styles.noteCardSelected
                          : {}),
                      }}
                    >
                      <div style={styles.noteCardTop}>
                        <strong>
                          {title}
                        </strong>

                        <span
                          style={styles.statusBadge}
                        >
                          {status}
                        </span>
                      </div>

                      <div style={styles.noteMeta}>
                        <span>
                          {subject}
                        </span>

                        <span>
                          {formatDate(updated)}
                        </span>
                      </div>

                      <div style={styles.noteId}>
                        {note["Note ID"] ||
                          note.airtableId ||
                          "No Note ID"}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div style={styles.reviewPanel}>
            {!selectedNote ? (
              <div style={styles.placeholder}>
                <div style={styles.placeholderIcon}>
                  ◈
                </div>

                <h2>
                  Select a note to review
                </h2>

                <p>
                  Choose an item from the review
                  queue to inspect its content,
                  assign its target programme and
                  class, then approve or request
                  changes.
                </p>
              </div>
            ) : (
              <>
                <div style={styles.panelHeader}>
                  <div>
                    <h2 style={styles.panelTitle}>
                      Review Note
                    </h2>

                    <p style={styles.panelDescription}>
                      Human approval is required
                      before publication.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeReview}
                    disabled={processing}
                    style={styles.closeButton}
                  >
                    Close
                  </button>
                </div>

                <div style={styles.noteContent}>
                  <h1 style={styles.noteTitle}>
                    {field(
                      selectedNote,
                      "Title",
                      "Topic",
                      "Note Title"
                    ) ||
                      "Untitled Note"}
                  </h1>

                  <div style={styles.metadata}>
                    <div>
                      <span>
                        Subject
                      </span>

                      <strong>
                        {field(
                          selectedNote,
                          "Subject",
                          "Subject Name"
                        ) || "—"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Version
                      </span>

                      <strong>
                        {field(
                          selectedNote,
                          "Version"
                        ) || "1"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Status
                      </span>

                      <strong>
                        {field(
                          selectedNote,
                          "Status"
                        ) || "Under Review"}
                      </strong>
                    </div>
                  </div>

                  <div style={styles.contentBox}>
                    <h3>
                      Learning Objectives
                    </h3>

                    <div style={styles.readOnlyContent}>
                      {field(
                        selectedNote,
                        "Learning Objectives"
                      ) || "Not provided."}
                    </div>
                  </div>

                  <div style={styles.contentBox}>
                    <h3>
                      Key Terms
                    </h3>

                    <div style={styles.readOnlyContent}>
                      {field(
                        selectedNote,
                        "Key Terms"
                      ) || "Not provided."}
                    </div>
                  </div>

                  <div style={styles.contentBox}>
                    <h3>
                      Note Content
                    </h3>

                    <div style={styles.readOnlyContent}>
                      {field(
                        selectedNote,
                        "Content"
                      ) || "No content provided."}
                    </div>
                  </div>

                  <div style={styles.formSection}>
                    <h3>
                      Publication Target
                    </h3>

                    <p style={styles.formHelp}>
                      These values belong to
                      NoteBank_Publications and
                      are required before
                      publication.
                    </p>

                    <label style={styles.label}>
                      Target Programme
                    </label>

                    <input
                      list="programme-options"
                      value={targetProgramme}
                      onChange={(event) =>
                        setTargetProgramme(
                          event.target.value
                        )
                      }
                      placeholder="e.g. WAEC"
                      style={styles.input}
                      disabled={processing}
                    />

                    <datalist id="programme-options">
                      {PROGRAMMES.map(
                        (programme) => (
                          <option
                            key={programme}
                            value={programme}
                          />
                        )
                      )}
                    </datalist>

                    <label style={styles.label}>
                      Target Class
                    </label>

                    <select
                      value={targetClass}
                      onChange={(event) =>
                        setTargetClass(
                          event.target.value
                        )
                      }
                      style={styles.input}
                      disabled={processing}
                    >
                      <option value="">
                        Select target class
                      </option>

                      {sortedClasses.map(
                        (classItem) => (
                          <option
                            key={
                              classItem.id ||
                              classItem.airtableId ||
                              classItem.name
                            }
                            value={
                              classItem.id ||
                              classItem.airtableId ||
                              classItem.name
                            }
                          >
                            {classItem.name}
                            {classItem.code
                              ? ` (${classItem.code})`
                              : ""}
                          </option>
                        )
                      )}
                    </select>

                    <label style={styles.label}>
                      Reviewer Comment
                    </label>

                    <textarea
                      value={reviewComment}
                      onChange={(event) =>
                        setReviewComment(
                          event.target.value
                        )
                      }
                      placeholder="Enter your review comment…"
                      rows={5}
                      style={styles.textarea}
                      disabled={processing}
                    />

                    <div style={styles.actionRow}>
                      <button
                        type="button"
                        onClick={requestChanges}
                        disabled={processing}
                        style={styles.changesButton}
                      >
                        {processing
                          ? "Processing…"
                          : "Request Changes"}
                      </button>

                      <button
                        type="button"
                        onClick={
                          approveAndPublish
                        }
                        disabled={processing}
                        style={styles.approveButton}
                      >
                        {processing
                          ? "Publishing…"
                          : "Approve & Publish"}
                      </button>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </section>
      </section>
    </main>
  );
}

const styles = {
  page: {
    minHeight: "100vh",
    background:
      "linear-gradient(135deg, #f5f9f6 0%, #eef4f0 100%)",
    color: "#173322",
    fontFamily:
      "Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
  },

  header: {
    minHeight: 76,
    padding: "16px 28px",
    background: "#ffffff",
    borderBottom: "1px solid #dce7df",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 20,
  },

  brand: {
    fontSize: 20,
    fontWeight: 800,
    letterSpacing: "0.04em",
  },

  subtitle: {
    marginTop: 4,
    color: "#6a7d70",
    fontSize: 13,
  },

  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },

  roleBadge: {
    padding: "7px 12px",
    borderRadius: 999,
    background: "#e8f3eb",
    color: "#1f6b3b",
    fontWeight: 700,
    fontSize: 12,
    textTransform: "uppercase",
  },

  logoutButton: {
    border: "1px solid #d8e2db",
    background: "#ffffff",
    color: "#365343",
    padding: "8px 14px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },

  container: {
    maxWidth: 1500,
    margin: "0 auto",
    padding: 24,
  },

  summaryGrid: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(190px, 1fr))",
    gap: 16,
    marginBottom: 20,
  },

  summaryCard: {
    background: "#ffffff",
    border: "1px solid #dce7df",
    borderRadius: 14,
    padding: 18,
    boxShadow:
      "0 4px 14px rgba(28, 67, 44, 0.05)",
  },

  summaryLabel: {
    display: "block",
    color: "#718277",
    fontSize: 12,
    marginBottom: 7,
    textTransform: "uppercase",
    letterSpacing: "0.05em",
  },

  summaryNumber: {
    fontSize: 28,
  },

  summaryValue: {
    fontSize: 20,
    textTransform: "capitalize",
  },

  workspace: {
    display: "grid",
    gridTemplateColumns:
      "minmax(300px, 420px) minmax(0, 1fr)",
    gap: 20,
    alignItems: "start",
  },

  queuePanel: {
    background: "#ffffff",
    border: "1px solid #dce7df",
    borderRadius: 14,
    overflow: "hidden",
    boxShadow:
      "0 4px 14px rgba(28, 67, 44, 0.05)",
  },

  reviewPanel: {
    background: "#ffffff",
    border: "1px solid #dce7df",
    borderRadius: 14,
    overflow: "hidden",
    minHeight: 650,
    boxShadow:
      "0 4px 14px rgba(28, 67, 44, 0.05)",
  },

  panelHeader: {
    padding: 20,
    borderBottom: "1px solid #e5ece7",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 12,
  },

  panelTitle: {
    margin: 0,
    fontSize: 19,
  },

  panelDescription: {
    margin: "5px 0 0",
    color: "#728177",
    fontSize: 13,
  },

  refreshButton: {
    border: "1px solid #cbdacf",
    background: "#f7faf8",
    color: "#28583b",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 600,
  },

  closeButton: {
    border: "1px solid #d8e2db",
    background: "#ffffff",
    padding: "8px 12px",
    borderRadius: 8,
    cursor: "pointer",
  },

  noteList: {
    padding: 12,
  },

  noteCard: {
    width: "100%",
    textAlign: "left",
    border: "1px solid #e0e9e3",
    background: "#ffffff",
    borderRadius: 10,
    padding: 14,
    marginBottom: 10,
    cursor: "pointer",
    color: "#173322",
  },

  noteCardSelected: {
    border:
      "2px solid #4b8a5c",
    background: "#f3f9f4",
  },

  noteCardTop: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    gap: 10,
  },

  statusBadge: {
    flexShrink: 0,
    padding: "4px 8px",
    borderRadius: 999,
    background: "#fff5dc",
    color: "#8a6417",
    fontSize: 10,
    fontWeight: 700,
  },

  noteMeta: {
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    color: "#65766b",
    fontSize: 12,
    marginTop: 9,
  },

  noteId: {
    marginTop: 7,
    color: "#9aa69f",
    fontSize: 10,
    overflowWrap: "anywhere",
  },

  empty: {
    padding: 50,
    textAlign: "center",
    color: "#65766b",
  },

  emptyIcon: {
    width: 52,
    height: 52,
    margin: "0 auto 15px",
    borderRadius: "50%",
    background: "#e7f3e9",
    color: "#327347",
    display: "grid",
    placeItems: "center",
    fontSize: 25,
    fontWeight: 800,
  },

  placeholder: {
    minHeight: 650,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center",
    padding: 40,
    color: "#68786e",
  },

  placeholderIcon: {
    fontSize: 48,
    color: "#5c936a",
    marginBottom: 12,
  },

  noteContent: {
    padding: 24,
  },

  noteTitle: {
    margin: "0 0 18px",
    fontSize: 28,
    lineHeight: 1.2,
  },

  metadata: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    marginBottom: 22,
  },

  metadataItem: {},

  metadata: {
    display: "grid",
    gridTemplateColumns:
      "repeat(auto-fit, minmax(150px, 1fr))",
    gap: 10,
    marginBottom: 22,
  },

  contentBox: {
    border: "1px solid #e1e9e4",
    borderRadius: 10,
    padding: 16,
    marginBottom: 14,
    background: "#fbfdfb",
  },

  readOnlyContent: {
    whiteSpace: "pre-wrap",
    lineHeight: 1.6,
    color: "#46574c",
    fontSize: 14,
  },

  formSection: {
    marginTop: 24,
    padding: 20,
    borderRadius: 12,
    background: "#f4f8f5",
    border: "1px solid #dce8df",
  },

  formHelp: {
    color: "#68786e",
    fontSize: 13,
    lineHeight: 1.5,
  },

  label: {
    display: "block",
    marginTop: 15,
    marginBottom: 6,
    fontWeight: 700,
    fontSize: 13,
  },

  input: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd9cf",
    background: "#ffffff",
    borderRadius: 8,
    padding: "11px 12px",
    fontSize: 14,
    outline: "none",
  },

  textarea: {
    width: "100%",
    boxSizing: "border-box",
    border: "1px solid #cbd9cf",
    background: "#ffffff",
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    resize: "vertical",
    fontFamily: "inherit",
  },

  actionRow: {
    display: "flex",
    justifyContent: "flex-end",
    gap: 10,
    marginTop: 20,
    flexWrap: "wrap",
  },

  changesButton: {
    border: "1px solid #d2a947",
    background: "#fff8e7",
    color: "#765710",
    padding: "11px 16px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  },

  approveButton: {
    border: "1px solid #28643b",
    background: "#28643b",
    color: "#ffffff",
    padding: "11px 18px",
    borderRadius: 8,
    cursor: "pointer",
    fontWeight: 700,
  },

  loadingCard: {
    maxWidth: 420,
    margin: "15vh auto",
    background: "#ffffff",
    border: "1px solid #dce7df",
    borderRadius: 16,
    padding: 35,
    textAlign: "center",
  },

  logo: {
    width: 55,
    height: 55,
    margin: "0 auto 15px",
    borderRadius: 14,
    background: "#28643b",
    color: "#ffffff",
    display: "grid",
    placeItems: "center",
    fontWeight: 800,
    fontSize: 18,
  },

  error: {
    marginBottom: 16,
    padding: 13,
    borderRadius: 9,
    background: "#fff0f0",
    border: "1px solid #e7bcbc",
    color: "#8a3030",
  },

  success: {
    marginBottom: 16,
    padding: 13,
    borderRadius: 9,
    background: "#edf8ef",
    border: "1px solid #b9dbbf",
    color: "#28643b",
  },
};