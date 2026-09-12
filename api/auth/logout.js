import { clearSessionCookie } from "../lib/_auth.js";

function send(res, status, body) {
  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return send(res, 405, {
      error: "Method not allowed.",
    });
  }

  try {
    clearSessionCookie(res);

    return send(res, 200, {
      ok: true,
      message: "Logged out successfully.",
    });
  } catch (error) {
    console.error("Logout error:", error);

    return send(res, 500, {
      error: "Authentication service temporarily unavailable.",
    });
  }
}
