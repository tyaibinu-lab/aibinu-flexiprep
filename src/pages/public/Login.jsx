import { useState } from "react";

const ROLE_CONFIG = {
  admin: {
    label: "ADMIN",
    portal: "Administration Portal",
    description: "Manage AIBINU Flexiprep operations and academic services.",
    redirect: "/admin",
  },
  teacher: {
    label: "TEACHER",
    portal: "Teacher Portal",
    description: "Manage teaching activities, notes, assessments and students.",
    redirect: "/teacher",
  },
  student: {
    label: "STUDENT",
    portal: "Student Portal",
    description: "Access your learning resources, CBT examinations and results.",
    redirect: "/student",
  },
};

export default function Login() {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState("");
  const [statusType, setStatusType] = useState("");
  const [authenticatedRole, setAuthenticatedRole] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (loading) {
      return;
    }

    setStatus("");
    setStatusType("");
    setAuthenticatedRole("");

    const cleanIdentifier = identifier.trim();

    if (!cleanIdentifier || !password) {
      setStatus("Please enter your login identifier and password.");
      setStatusType("error");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          identifier: cleanIdentifier,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        setStatus(data.error || "Login failed. Please check your credentials.");
        setStatusType("error");
        return;
      }

      /*
       * The login API currently returns the authenticated role
       * at data.role.
       *
       * The fallback to data.user.role makes the frontend
       * tolerant of a nested response if the API is changed
       * later.
       */
      const role = String(
        data.role ?? data.user?.role ?? ""
      )
        .trim()
        .toLowerCase();

      const roleConfig = ROLE_CONFIG[role];

      if (!roleConfig) {
        setStatus(
          "Authentication succeeded, but the account role could not be identified. Please contact the administrator."
        );
        setStatusType("error");
        return;
      }

      setAuthenticatedRole(role);
      setStatus(`Login successful. Welcome to the ${roleConfig.label} Portal.`);
      setStatusType("success");

      /*
       * Give the user a short visual confirmation of the
       * authenticated account type before redirecting.
       */
      window.setTimeout(() => {
        window.location.assign(roleConfig.redirect);
      }, 700);
    } catch (error) {
      console.error("Login error:", error);

      setStatus(
        "Unable to connect to the authentication service. Please try again."
      );
      setStatusType("error");
    } finally {
      setPassword("");
      setLoading(false);
    }
  }

  const currentRole = authenticatedRole
    ? ROLE_CONFIG[authenticatedRole]
    : null;

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px",
        background:
          "linear-gradient(135deg, #f4f8f5 0%, #eef5f0 50%, #fffaf0 100%)",
        boxSizing: "border-box",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "#ffffff",
          borderRadius: "18px",
          padding: "36px",
          boxSizing: "border-box",
          boxShadow: "0 18px 50px rgba(0, 0, 0, 0.10)",
          border: "1px solid rgba(15, 92, 67, 0.10)",
        }}
      >
        {/* Brand */}
        <header
          style={{
            textAlign: "center",
            marginBottom: "30px",
          }}
        >
          <div
            style={{
              width: "68px",
              height: "68px",
              margin: "0 auto 16px",
              borderRadius: "50%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background:
                "linear-gradient(135deg, #075e45 0%, #0b8060 100%)",
              color: "#f4c542",
              fontWeight: "800",
              fontSize: "24px",
              letterSpacing: "1px",
              boxShadow: "0 8px 20px rgba(7, 94, 69, 0.20)",
            }}
          >
            AF
          </div>

          <h1
            style={{
              margin: 0,
              color: "#075e45",
              fontSize: "30px",
              fontWeight: "800",
              letterSpacing: "0.5px",
            }}
          >
            AIBINU FLEXIPREP
          </h1>

          <p
            style={{
              margin: "8px 0 0",
              color: "#666666",
              fontSize: "15px",
            }}
          >
            Secure Account Access
          </p>
        </header>

        {/* Account-role explanation */}
        <div
          style={{
            marginBottom: "24px",
            padding: "14px 16px",
            borderRadius: "10px",
            background: "#f5faf7",
            border: "1px solid #dceee4",
            color: "#315847",
            fontSize: "13px",
            lineHeight: "1.5",
          }}
        >
          <strong>Secure role-based access</strong>
          <br />
          Your portal is determined automatically from your authenticated
          account. You do not need to select Admin, Teacher or Student.
        </div>

        <form onSubmit={handleSubmit}>
          {/* Login Identifier */}
          <div style={{ marginBottom: "20px" }}>
            <label
              htmlFor="identifier"
              style={{
                display: "block",
                marginBottom: "8px",
                color: "#26352e",
                fontWeight: "700",
                fontSize: "14px",
              }}
            >
              Login Identifier
            </label>

            <input
              id="identifier"
              name="identifier"
              type="text"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder="Enter your username"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              disabled={loading}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "14px 15px",
                borderRadius: "10px",
                border: "1px solid #cbd8d1",
                outline: "none",
                fontSize: "15px",
                color: "#1f2d27",
                background: loading ? "#f5f5f5" : "#ffffff",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ marginBottom: "22px" }}>
            <label
              htmlFor="password"
              style={{
                display: "block",
                marginBottom: "8px",
                color: "#26352e",
                fontWeight: "700",
                fontSize: "14px",
              }}
            >
              Password
            </label>

            <input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Enter your password"
              autoComplete="current-password"
              disabled={loading}
              style={{
                width: "100%",
                boxSizing: "border-box",
                padding: "14px 15px",
                borderRadius: "10px",
                border: "1px solid #cbd8d1",
                outline: "none",
                fontSize: "15px",
                color: "#1f2d27",
                background: loading ? "#f5f5f5" : "#ffffff",
              }}
            />
          </div>

          {/* Sign In */}
          <button
            type="submit"
            disabled={loading}
            style={{
              width: "100%",
              border: "none",
              borderRadius: "10px",
              padding: "14px 18px",
              background: loading
                ? "#7aa596"
                : "linear-gradient(135deg, #075e45 0%, #0b8060 100%)",
              color: "#ffffff",
              fontSize: "16px",
              fontWeight: "700",
              cursor: loading ? "not-allowed" : "pointer",
              boxShadow: loading
                ? "none"
                : "0 8px 18px rgba(7, 94, 69, 0.20)",
            }}
          >
            {loading ? "Authenticating..." : "Sign In"}
          </button>
        </form>

        {/* Authentication result */}
        {status && (
          <div
            role="status"
            aria-live="polite"
            style={{
              marginTop: "20px",
              padding: "15px 16px",
              borderRadius: "10px",
              background:
                statusType === "success" ? "#eef9f2" : "#fff1f1",
              border:
                statusType === "success"
                  ? "1px solid #bfe3ca"
                  : "1px solid #efc5c5",
              color:
                statusType === "success" ? "#17643b" : "#a12626",
              lineHeight: "1.5",
              fontSize: "14px",
            }}
          >
            {status}

            {currentRole && (
              <div
                style={{
                  marginTop: "10px",
                  display: "inline-flex",
                  alignItems: "center",
                  gap: "8px",
                  padding: "6px 10px",
                  borderRadius: "999px",
                  background: "#075e45",
                  color: "#ffffff",
                  fontSize: "12px",
                  fontWeight: "800",
                  letterSpacing: "0.5px",
                }}
              >
                <span>✓</span>
                {currentRole.label} ACCESS
              </div>
            )}

            {currentRole && (
              <div
                style={{
                  marginTop: "8px",
                  color: "#416053",
                  fontSize: "13px",
                }}
              >
                Redirecting to your {currentRole.portal}...
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <footer
          style={{
            marginTop: "28px",
            paddingTop: "18px",
            borderTop: "1px solid #edf1ee",
            textAlign: "center",
            color: "#78847e",
            fontSize: "12px",
            lineHeight: "1.5",
          }}
        >
          <div style={{ fontWeight: "700", color: "#075e45" }}>
            AIBINU FLEXIPREP EDUCONSULT LTD
          </div>

          <div style={{ marginTop: "4px" }}>
            Secure • Academic • Examination Focused
          </div>
        </footer>
      </section>
    </main>
  );
}