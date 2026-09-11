import { getCurrentUser } from "../lib/_auth.js";

export default function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({
      error: "Method not allowed.",
    });
  }

  try {
    const user = getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Authentication required.",
      });
    }

    return res.status(200).json({
      user,
    });
  } catch (error) {
    console.error("Session lookup error:", error);

    return res.status(500).json({
      error: "Authentication service temporarily unavailable.",
    });
  }
}