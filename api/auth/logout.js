import { clearSessionCookie } from "../lib/_auth.js";

export default function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    clearSessionCookie(res);

    return res.status(200).json({
      success: true,
    });
  } catch (error) {
    console.error("Logout error:", error);

    return res.status(500).json({
      error: "Logout service temporarily unavailable.",
    });
  }
}