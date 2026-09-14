import { BrowserRouter, Routes, Route } from "react-router-dom";

import Home from "./pages/public/Home.jsx";
import Login from "./pages/public/Login.jsx";

import StudentDashboard from "./pages/student/Dashboard.jsx";
import TeacherDashboard from "./pages/teacher/Dashboard.jsx";
import AdminDashboard from "./pages/admin/Dashboard.jsx";
import ReviewerDashboard from "./pages/reviewer/ReviewerDashboard.jsx";
import ProtectedRoute from "./components/auth/ProtectedRoute.jsx";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />

        <Route
  path="/student"
  element={
    <ProtectedRoute allowedRoles={["student"]}>
      <StudentDashboard />
    </ProtectedRoute>
  }
/>
        <Route path="/teacher" element={<ProtectedRoute allowedRoles={["teacher"]}><TeacherDashboard /></ProtectedRoute>} />

        <Route
          path="/admin"
          element={
            <ProtectedRoute allowedRoles={["admin"]}>
              <AdminDashboard />
            </ProtectedRoute>
          }
 />

        <Route
          path="/reviewer"
          element={
           <ProtectedRoute allowedRoles={["reviewer", "admin"]}>
              <ReviewerDashboard />
            </ProtectedRoute>
         }
         
        />

        <Route
          path="*"
          element={
            <main>
              <h1>404</h1>
              <p>Page not found.</p>
            </main>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}

export default App;

