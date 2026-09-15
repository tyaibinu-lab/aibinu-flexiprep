const REQUIRED_ENV = [
  "AUTH_SECRET",
  "AIRTABLE_PAT",
  "AIRTABLE_BASE_ID",
];

export function getConfig() {
  const missing = REQUIRED_ENV.filter((name) => !process.env[name]);

  if (missing.length > 0) {
    throw new Error(
      `Missing required server environment variables: ${missing.join(", ")}`
    );
  }

  return {
    appEnv: process.env.APP_ENV || "development",

    authSecret: process.env.AUTH_SECRET,

    airtable: {
      pat: process.env.AIRTABLE_PAT,
      baseId: process.env.AIRTABLE_BASE_ID,
      tables: {
        authUsers:
          process.env.AIRTABLE_AUTH_USERS_TABLE || "Auth_Users",
        students:
          process.env.AIRTABLE_STUDENTS_TABLE || "Students",
        teachers:
          process.env.AIRTABLE_TEACHERS_TABLE || "Teachers",
        aiJobs:
          process.env.AIRTABLE_AI_JOBS_TABLE || "tbldFSYwYcTMtMm9A",
        noteBankNotes:
          process.env.AIRTABLE_NOTEBANK_NOTES_TABLE || "tblsEjHgHA7vhPgm0",
        questions:
          process.env.AIRTABLE_QUESTIONS_TABLE || "tblWz5hU4tpVvMJbF",
      },
    },

    openaiApiKey: process.env.OPENAI_API_KEY || "",
  };
}
