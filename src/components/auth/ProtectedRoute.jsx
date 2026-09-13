import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";

export default function ProtectedRoute({ allowedRoles, children }) {
  const [status, setStatus] = useState("checking");
  const [user, setUser] = useState(null);

  useEffect(() => {
    let active = true;

    fetch("/api/auth/me", {
      method: "GET",
      credentials: "include",
    })
      .then(async (response) => {
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(data.error || "Authentication required.");
        }

        return data;
      })
      .then((data) => {
        if (!active) return;

        setUser(data.user);
        setStatus("authenticated");
      })
      .catch(() => {
        if (!active) return;

        setStatus("unauthenticated");
      });

    return () => {
      active = false;
    };
  }, []);

  if (status === "checking") {
    return <main><p>Checking authentication...</p></main>;
  }

  if (status === "unauthenticated") {
    return <Navigate to="/login" replace />;
  }

  if (
    Array.isArray(allowedRoles) &&
    allowedRoles.length > 0 &&
    !allowedRoles.includes(user?.role)
  ) {
    return <Navigate to="/login" replace />;
  }

  return children;
}
