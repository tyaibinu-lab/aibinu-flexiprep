import { getCurrentUser } from "../lib/_auth.js";

function send(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return send(res, 405, {
      error: "Method not allowed.",
    });
  }

  try {
    const user = getCurrentUser(req);

    if (!user) {
      return send(res, 401, {
        error: "Authentication required.",
      });
    }

    return send(res, 200, {
      ok: true,
      user: {
        role: user.role,
        studentId: user.studentId ?? null,
        teacherId: user.teacherId ?? null,
      },
    });
  } catch (error) {
    console.error("Session verification error:", error);

    return send(res, 500, {
      error: "Authentication service temporarily unavailable.",
    });
  }
}
