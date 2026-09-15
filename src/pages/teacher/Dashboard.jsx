import { Link } from "react-router-dom";
export default function TeacherDashboard() {
  return (
    <main>
      <h1>Teacher Dashboard</h1>
      <p>Manage teaching, NoteBank and academic resources.</p>
      <section style={{ marginTop: 24 }}>
        <h2>Academic Management</h2>
        <p>Create AI-powered notes and questions, review drafts, and manage NoteBank content.</p>
        <Link to="/teacher/academic">Open Academic Management →</Link>
      </section>
    </main>
  );
}
