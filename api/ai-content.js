// AIBINU FLEXIPREP EDUCONSULT — SECURE AI CONTENT API
import { getConfig as getServerConfig } from "./lib/config.js";
import { requireRole } from "./lib/_auth.js";
// Enhanced AI NoteBank backend: equations, diagrams, images, graphs and safe simulations.
// Replace api/ai-content.js with this file.

const AIRTABLE_API = "https://api.airtable.com/v0";
const OPENAI_API = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-5.6-luna";

const TABLES = {
  AI_JOBS: "tbldFSYwYcTMtMm9A",
  NOTES: "tblsEjHgHA7vhPgm0",
  QUESTIONS: "tblWz5hU4tpVvMJbF"
};


// ============================================================
// VERCEL HANDLER
// ============================================================

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  // Only authenticated teachers/admins may generate AI content.
  // Identity is derived from the signed server session.
  const user = requireRole(req, res, ["teacher", "admin"]);
  if (!user) return;
// ----------------------------------------------------------
  // HEALTH CHECK
  // ----------------------------------------------------------

  if (req.method === "GET") {

    return res.status(200).json({

      success: true,

      service:
        "AIBINU Flexiprep AI Content API",

      model:
        OPENAI_MODEL,

      airtableConfigured:
        Boolean(process.env.AIRTABLE_PAT),

      baseConfigured:
        Boolean(process.env.AIRTABLE_BASE_ID),

      openaiConfigured:
        Boolean(process.env.OPENAI_API_KEY)

    });

  }

  // ----------------------------------------------------------
  // ONLY POST
  // ----------------------------------------------------------

  if (req.method !== "POST") {

    return res.status(405).json({
      success: false,
      error:
        "Method not allowed."
    });

  }

  try {

    const config =
      getConfig();

    const body = {
      ...(req.body || {}),
      requestedBy: user.teacherId || null,
    };

    const type =
      clean(
        body.contentType ||
        body.type ||
        body.mode
      ).toLowerCase();


    // --------------------------------------------------------
    // NOTE
    // --------------------------------------------------------

    if (
      ["note", "notes", "generate-note"]
        .includes(type)
    ) {

      return res.status(200).json({
        success: true,

        ...await generateNote(
          config,
          body
        )

      });

    }


    // --------------------------------------------------------
    // QUESTION
    // --------------------------------------------------------

    if (
      ["question", "questions", "generate-question"]
        .includes(type)
    ) {

      return res.status(200).json({
        success: true,

        ...await generateQuestions(
          config,
          body
        )

      });

    }


    return res.status(400).json({
      success: false,
      error:
        "Invalid contentType. Use Note or Question."
    });


  } catch (error) {

    console.error(
      "AI CONTENT API ERROR:",
      error
    );

    return res.status(500).json({
      success: false,
      error:
        error.message ||
        "AI content generation failed."
    });

  }

}


// ============================================================
// SERVER CONFIGURATION
// ============================================================

function getConfig() {
  const config = getServerConfig();
  if (!config.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured.");
  }
  return {
    openaiKey: config.openaiApiKey,
    airtablePat: config.airtable.pat,
    airtableBaseId: config.airtable.baseId,
  };
}

// ============================================================
// BASIC HELPERS
// ============================================================

function clean(value) {

  if (
    value === undefined ||
    value === null
  ) {

    return "";

  }

  return String(value).trim();

}


function makeId(prefix) {

  return (
    `${prefix}-${Date.now()}-` +
    `${Math.floor(
      Math.random() * 100000
    )}`
  );

}


// ============================================================
// NORMALIZATION
// ============================================================

function normalizeDifficulty(value) {

  const valid = [
    "Easy",
    "Medium",
    "Hard"
  ];

  return (
    valid.find(
      x =>
        x.toLowerCase() ===
        clean(value).toLowerCase()
    ) ||
    "Medium"
  );

}


function normalizeBloom(value) {

  const valid = [
    "Remember",
    "Understand",
    "Apply",
    "Analyze",
    "Evaluate",
    "Create"
  ];

  return (
    valid.find(
      x =>
        x.toLowerCase() ===
        clean(value).toLowerCase()
    ) ||
    "Understand"
  );

}


function normalizeQuestionType(value) {

  const valid = [
    "MCQ",
    "Theory",
    "Calculation",
    "Practical",
    "Objective"
  ];

  return (
    valid.find(
      x =>
        x.toLowerCase() ===
        clean(value).toLowerCase()
    ) ||
    "MCQ"
  );

}


function normalizeExamTypes(value) {

  const valid = [
    "WAEC",
    "NECO",
    "UTME",
    "General",
    "IJMB",
    "JUPEB"
  ];

  const values =
    Array.isArray(value)
      ? value
      : clean(value)
          .split(",")
          .map(x => x.trim());

  const result =
    values.filter(
      x =>
        valid.some(
          y =>
            y.toLowerCase() ===
            String(x).toLowerCase()
        )
    );

  return result.length
    ? result
    : ["General"];

}


// ============================================================
// MIXED DISTRIBUTION
// ============================================================

function createBalancedList(
  count,
  values
) {

  const result =
    Array.from(
      { length: count },
      (_, i) =>
        values[i % values.length]
    );


  for (
    let i = result.length - 1;
    i > 0;
    i--
  ) {

    const j =
      Math.floor(
        Math.random() *
        (i + 1)
      );

    [
      result[i],
      result[j]
    ] = [
      result[j],
      result[i]
    ];

  }


  return result;

}


function getDifficultyList(
  count,
  value
) {

  return (
    clean(value).toLowerCase() ===
    "mixed"
  )

    ? createBalancedList(
        count,
        [
          "Easy",
          "Medium",
          "Hard"
        ]
      )

    : Array(count).fill(
        normalizeDifficulty(
          value || "Medium"
        )
      );

}


function getBloomList(
  count,
  value
) {

  return (
    clean(value).toLowerCase() ===
    "mixed"
  )

    ? createBalancedList(
        count,
        [
          "Remember",
          "Understand",
          "Apply",
          "Analyze",
          "Evaluate",
          "Create"
        ]
      )

    : Array(count).fill(
        normalizeBloom(
          value || "Apply"
        )
      );

}


// ============================================================
// AIRTABLE REQUEST
// ============================================================

async function airtableRequest(
  config,
  tableId,
  method,
  body
) {

  const response =
    await fetch(
      `${AIRTABLE_API}/` +
      `${config.airtableBaseId}/` +
      `${tableId}`,

      {

        method,

        headers: {

          Authorization:
            `Bearer ${config.airtablePat}`,

          "Content-Type":
            "application/json"

        },

        ...(body === undefined
          ? {}
          : {
              body:
                JSON.stringify(body)
            })

      }

    );


  const text =
    await response.text();

  let data;


  try {

    data =
      JSON.parse(text);

  } catch {

    data = {
      raw: text
    };

  }


  if (!response.ok) {

    throw new Error(

      data?.error?.message ||
      data?.error?.type ||
      `Airtable error ${response.status}`

    );

  }


  return data;

}


// ============================================================
// CREATE ONE RECORD
// ============================================================

async function createRecord(
  config,
  tableId,
  fields
) {

  return airtableRequest(

    config,
    tableId,
    "POST",

    {

      records: [

        {
          fields
        }

      ],

      typecast: true

    }

  );

}


// ============================================================
// CREATE MANY RECORDS
// ============================================================

async function createManyRecords(
  config,
  tableId,
  records
) {

  const output = [];


  for (
    let i = 0;
    i < records.length;
    i += 10
  ) {

    const chunk =
      records.slice(
        i,
        i + 10
      );


    const result =
      await airtableRequest(

        config,
        tableId,
        "POST",

        {

          records:
            chunk.map(
              fields => ({
                fields
              })
            ),

          typecast:
            true

        }

      );


    if (
      Array.isArray(
        result.records
      )
    ) {

      output.push(
        ...result.records
      );

    }

  }


  return output;

}


// ============================================================
// OPENAI RESPONSES API
// ============================================================

async function callOpenAI(
  config,
  instructions,
  input
) {

  const response =
    await fetch(
      OPENAI_API,

      {

        method: "POST",

        headers: {

          Authorization:
            `Bearer ${config.openaiKey}`,

          "Content-Type":
            "application/json"

        },

        body:
          JSON.stringify({

            model:
              OPENAI_MODEL,

            store:
              false,

            instructions:
              `${instructions}

IMPORTANT JSON OUTPUT REQUIREMENT:

Return valid JSON only.

Do not use Markdown fences.

Do not write text outside the JSON object.`,

            input:
              `IMPORTANT:
The required response format is JSON.

${input}

Return valid JSON only.`,

            text: {

              format: {

                type:
                  "json_object"

              }

            }

          })

      }

    );


  const responseText =
    await response.text();

  let data;


  try {

    data =
      JSON.parse(
        responseText
      );

  } catch {

    throw new Error(
      `OpenAI returned an invalid response: ` +
      `${responseText.slice(0, 500)}`
    );

  }


  if (!response.ok) {

    throw new Error(

      data?.error?.message ||
      `OpenAI error ${response.status}`

    );

  }


  if (
    data.output_text
  ) {

    return data
      .output_text
      .trim();

  }


  let output = "";


  for (
    const item
    of Array.isArray(data.output)
      ? data.output
      : []
  ) {

    for (
      const content
      of Array.isArray(item.content)
        ? item.content
        : []
    ) {

      if (
        content.type ===
        "output_text"
      ) {

        output +=
          content.text || "";

      }

    }

  }


  if (!output.trim()) {

    throw new Error(
      "OpenAI returned no usable output."
    );

  }


  return output.trim();

}


// ============================================================
// PARSE AI JSON
// ============================================================

function parseAIJSON(text) {

  const cleaned =
    clean(text)
      .replace(
        /^```json/i,
        ""
      )
      .replace(
        /^```/i,
        ""
      )
      .replace(
        /```$/i,
        ""
      )
      .trim();


  try {

    return JSON.parse(
      cleaned
    );

  } catch {}


  const first =
    cleaned.indexOf("{");

  const last =
    cleaned.lastIndexOf("}");


  if (
    first >= 0 &&
    last > first
  ) {

    try {

      return JSON.parse(
        cleaned.slice(
          first,
          last + 1
        )
      );

    } catch {}

  }


  throw new Error(
    "AI returned invalid JSON."
  );

}


// ============================================================
// AI JOB LOGGING
// ============================================================

async function logAIJob(
  config,
  data
) {

  try {

    const fields = {

      "AI Job ID":
        makeId("AI"),

      "Content Type":
        data.contentType,

      "Prompt":
        clean(data.prompt),

      "AI Output":
        clean(data.aiOutput),

      "Model":
        OPENAI_MODEL,

      "Status":
        "Generated",

      "Created Date":
        new Date().toISOString()

    };


    if (
      data.requestedBy
    ) {

      fields["Requested By"] =
        [data.requestedBy];

    }


    if (
      data.subjectId
    ) {

      fields.Subject =
        [data.subjectId];

    }


    if (
      data.topicId
    ) {

      fields.Topic =
        [data.topicId];

    }


    if (
      data.classId
    ) {

      fields.Class =
        [data.classId];

    }


    return await createRecord(
      config,
      TABLES.AI_JOBS,
      fields
    );

  } catch (error) {

    console.error(
      "AI JOB LOGGING ERROR:",
      error.message
    );

    return null;

  }

}


// ============================================================
// SAFE VISUAL COMPONENTS
// ============================================================

const VISUAL_TYPES =
  new Set([

    "equation",
    "diagram",
    "image",
    "graph",
    "interactive",
    "simulation"

  ]);


const SIMULATIONS =
  new Set([

    "projectile_motion",
    "ohms_law",
    "hookes_law",
    "uniform_acceleration",
    "simple_pendulum",
    "series_parallel_circuit",
    "wave_motion",
    "lens_formula",
    "transformer",
    "density_pressure",
    "gas_law",
    "probability",
    "electromagnetic_induction",
    "electrolysis"

  ]);


// ============================================================
// VALIDATE ONE VISUAL
// ============================================================

function safeVisual(v) {

  if (
    !v ||
    typeof v !== "object"
  ) {

    return null;

  }


  const type =
    clean(v.type)
      .toLowerCase();


  if (
    !VISUAL_TYPES.has(type)
  ) {

    return null;

  }


  const output = {
    type
  };


  // ----------------------------------------------------------
  // EQUATION
  // ----------------------------------------------------------

  if (
    type === "equation"
  ) {

    output.latex =
      clean(v.latex)
        .slice(0, 1000);

    output.caption =
      clean(v.caption)
        .slice(0, 300);

    output.variables =
      clean(v.variables)
        .slice(0, 1000);


    if (
      !output.latex
    ) {

      return null;

    }

  }


  // ----------------------------------------------------------
  // DIAGRAM
  // ----------------------------------------------------------

  if (
    type === "diagram"
  ) {

    output.diagram =
      clean(v.diagram)
        .slice(0, 80);

    output.title =
      clean(v.title)
        .slice(0, 200);

    output.labels =
      Array.isArray(v.labels)

        ? v.labels
            .map(clean)
            .slice(0, 30)

        : [];

    output.description =
      clean(v.description)
        .slice(0, 1000);

  }


  // ----------------------------------------------------------
  // IMAGE
  // ----------------------------------------------------------

  if (
    type === "image"
  ) {

    output.imageQuery =
      clean(v.imageQuery)
        .slice(0, 300);

    output.caption =
      clean(v.caption)
        .slice(0, 300);

    output.alt =
      clean(v.alt)
        .slice(0, 300);


    if (
      !output.imageQuery &&
      !output.alt
    ) {

      return null;

    }

  }


  // ----------------------------------------------------------
  // GRAPH
  // ----------------------------------------------------------

  if (
    type === "graph"
  ) {

    output.graph =
      clean(v.graph)
        .slice(0, 80);

    output.title =
      clean(v.title)
        .slice(0, 200);

    output.xLabel =
      clean(v.xLabel)
        .slice(0, 100);

    output.yLabel =
      clean(v.yLabel)
        .slice(0, 100);

    output.data =
      Array.isArray(v.data)

        ? v.data
            .slice(0, 100)
            .map(
              p =>
                Array.isArray(p)
                  ? p.slice(0, 2)
                  : null
            )
            .filter(Boolean)

        : [];

  }


  // ----------------------------------------------------------
  // INTERACTIVE
  // ----------------------------------------------------------

  if (
    type === "interactive"
  ) {

    output.interaction =
      clean(v.interaction)
        .slice(0, 80);

    output.title =
      clean(v.title)
        .slice(0, 200);

    output.instructions =
      clean(v.instructions)
        .slice(0, 500);

    output.parameters =
      Array.isArray(v.parameters)

        ? v.parameters
            .slice(0, 12)
            .map(p => ({

              name:
                clean(
                  p?.name
                ).slice(0, 80),

              min:
                Number(p?.min),

              max:
                Number(p?.max),

              step:
                Number(p?.step),

              value:
                Number(p?.value)

            }))

        : [];

  }


  // ----------------------------------------------------------
  // SIMULATION
  // ----------------------------------------------------------

  if (
    type === "simulation"
  ) {

    output.simulation =
      clean(v.simulation)
        .toLowerCase();


    if (
      !SIMULATIONS.has(
        output.simulation
      )
    ) {

      return null;

    }


    output.title =
      clean(v.title)
        .slice(0, 200);

    output.instructions =
      clean(v.instructions)
        .slice(0, 500);

    output.variables = {};


    if (
      v.variables &&
      typeof v.variables ===
        "object"
    ) {

      for (
        const [key, value]
        of Object.entries(
          v.variables
        ).slice(0, 12)
      ) {

        const number =
          Number(value);


        if (
          Number.isFinite(
            number
          )
        ) {

          output.variables[key] =
            Math.max(
              -100000,
              Math.min(
                100000,
                number
              )
            );

        }

      }

    }

  }


  return output;

}


// ============================================================
// NORMALIZE VISUALS
// ============================================================

function normalizeVisuals(
  visuals
) {

  return Array.isArray(visuals)

    ? visuals
        .map(safeVisual)
        .filter(Boolean)
        .slice(0, 40)

    : [];

}


// ============================================================
// GENERATE NOTE
// ============================================================

async function generateNote(
  config,
  body
) {

  const subject =
    clean(body.subject);

  const subjectId =
    clean(body.subjectId);

  const topic =
    clean(body.topic);

  const topicId =
    clean(body.topicId);

  const className =
    clean(body.className) ||
    "SS1";

  const classId =
    clean(body.classId);

  const programme =
    clean(body.programme) ||
    "General";

  const requestedBy =
    clean(body.requestedBy);

  const teacherPrompt =
    clean(
      body.teacherPrompt ||
      body.prompt
    );

  const examTypes =
    normalizeExamTypes(
      body.examTypes
    );


  if (!subject) {

    throw new Error(
      "Subject is required."
    );

  }


  if (!topic) {

    throw new Error(
      "Topic is required."
    );

  }


  if (!teacherPrompt) {

    throw new Error(
      "Teacher prompt is required."
    );

  }


  // ----------------------------------------------------------
  // AI INSTRUCTIONS
  // ----------------------------------------------------------

  const instructions = `

You are the official AI academic
content assistant for AIBINU
FLEXIPREP EDUCONSULT.

The TEACHER'S PROMPT is the
PRIMARY instruction.

Prepare accurate, engaging,
age-appropriate Nigerian
secondary-school material.

Align with WAEC, NECO and UTME
where applicable.

Do not invent examination
requirements.

Do not output executable code.

Do not output arbitrary URLs.

Return JSON only.

`;


  // ----------------------------------------------------------
  // AI INPUT
  // ----------------------------------------------------------

  const input = `

RESPONSE FORMAT:

JSON


SUBJECT:
${subject}


CLASS:
${className}


PROGRAMME:
${programme}


TOPIC:
${topic}


EXAMINATION FOCUS:
${examTypes.join(", ")}


TEACHER'S PROMPT:
${teacherPrompt}


Create a comprehensive study note
containing:

title

learningObjectives

keyTerms

content

examples

workedExamples

formulae

applications

commonMisconceptions

diagrams

summary

examTips

waecFocus

necoFocus

utmeFocus


VISUAL COMPONENTS — MANDATORY WHEN REQUESTED:

The teacher's prompt is the primary instruction.

If the teacher explicitly requests equations, diagrams, graphs,
images, interactive diagrams, simulations, tables, comparisons,
flowcharts or process illustrations, you MUST generate the
appropriate visualComponents.

NEVER return an empty visualComponents array when the teacher
has explicitly requested visual content.

RULES:

1. If important equations or formulae are present, include
   equation components using LaTeX.

2. If a labelled diagram is requested, include at least one
   diagram component with clear educational labels.

3. If a graph is requested, include a graph component with
   meaningful numeric data where appropriate.

4. If an interactive simulation is requested, include at least
   one simulation component using ONLY an approved simulation
   type listed below.

5. If an image would improve understanding, include an image
   component containing imageQuery and alt metadata only.

6. NEVER invent image URLs.

7. Visual components must be directly relevant to the topic.

8. Return visualComponents as a JSON array.

9. Never put arbitrary HTML, CSS, JavaScript or SVG inside
   visualComponents.

10. Use these structures:

Equation:
{
  "type": "equation",
  "latex": "F = ma",
  "caption": "Newton's Second Law"
}

Diagram:
{
  "type": "diagram",
  "title": "Electromagnetic Induction",
  "description": "A labelled diagram showing a bar magnet moving into a coil connected to a galvanometer.",
  "labels": [
    "bar magnet",
    "coil",
    "galvanometer",
    "direction of motion"
  ]
}

Graph:
{
  "type": "graph",
  "title": "Velocity-Time Graph",
  "xLabel": "Time (s)",
  "yLabel": "Velocity (m/s)",
  "data": [
    [0,0],
    [1,5],
    [2,10],
    [3,15]
  ]
}

Simulation:
{
  "type": "simulation",
  "simulation": "projectile_motion",
  "variables": {
    "velocity": 20,
    "angle": 45,
    "gravity": 9.81
  }
}

If the teacher does NOT explicitly request a particular visual,
include visuals only when they genuinely improve understanding.

SIMULATIONS:

Only use these simulation names:

projectile_motion

ohms_law

hookes_law

uniform_acceleration

simple_pendulum

series_parallel_circuit

wave_motion

lens_formula

transformer

density_pressure

gas_law

probability

electromagnetic_induction

electrolysis

Never output:

JavaScript

HTML

CSS

SVG

iframe code

data URLs

arbitrary URLs


Return exactly:

{
  "title": "",
  "learningObjectives": "",
  "keyTerms": "",
  "content": "",
  "examples": "",
  "workedExamples": "",
  "formulae": "",
  "applications": "",
  "commonMisconceptions": "",
  "diagrams": "",
  "summary": "",
  "examTips": "",
  "waecFocus": "",
  "necoFocus": "",
  "utmeFocus": "",
  "visualComponents": []
}

`;


  // ----------------------------------------------------------
  // CALL AI
  // ----------------------------------------------------------

  const aiText =
    await callOpenAI(
      config,
      instructions,
      input
    );


  const raw =
    parseAIJSON(
      aiText
    );


  // ----------------------------------------------------------
  // VISUAL VALIDATION
  // ----------------------------------------------------------

  const visualComponents =
    normalizeVisuals(
      raw.visualComponents
    );


  const diagramVisuals =
    visualComponents.filter(
      visual =>
        visual.type === "diagram" ||
        visual.type === "graph"
    );


  const diagrams =
    clean(raw.diagrams) ||

    (
      diagramVisuals.length
        ? JSON.stringify(
            diagramVisuals
          )
        : ""
    );


  // ----------------------------------------------------------
  // CREATE NOTE
  // ----------------------------------------------------------

  const now =
    new Date().toISOString();

  const fields = {

    "Note ID":
      makeId("NOTE"),

    "Title":
      clean(raw.title) ||
      `${subject}: ${topic}`,

    "Content":
      clean(raw.content),

    "Learning Objectives":
      clean(
        raw.learningObjectives
      ),

    "Key Terms":
      clean(
        raw.keyTerms
      ),

    "Examples":
      clean(
        raw.examples
      ),

    "Worked Examples":
      clean(
        raw.workedExamples
      ),

    "Formulae":
      clean(
        raw.formulae
      ),

    "Applications":
      clean(
        raw.applications
      ),

    "Common Misconceptions":
      clean(
        raw.commonMisconceptions
      ),

    "Diagrams":
      diagrams,

    "Summary":
      clean(
        raw.summary
      ),

    "Exam Tips":
      clean(
        raw.examTips
      ),

    "WAEC Focus":
      clean(
        raw.waecFocus
      ),

    "NECO Focus":
      clean(
        raw.necoFocus
      ),

    "UTME Focus":
      clean(
        raw.utmeFocus
      ),

    "Teacher Prompt":
      teacherPrompt,

    "Version":
      "1.0",

    "Status":
      "AI Draft",

    "Created Date":
      now,

    "Updated Date":
      now

  };


  // ----------------------------------------------------------
  // LINK TOPIC
  // ----------------------------------------------------------

  if (
    topicId
  ) {

    fields.Topic =
      [topicId];

  }


  // ----------------------------------------------------------
  // LINK TEACHER
  // ----------------------------------------------------------

  if (
    requestedBy
  ) {

    fields["Created By"] =
      [requestedBy];

  }


  // ----------------------------------------------------------
  // CREATE AIRTABLE NOTE
  // ----------------------------------------------------------

  const created =
    await createRecord(
      config,
      TABLES.NOTES,
      fields
    );


  // ----------------------------------------------------------
  // LOG AI JOB
  // ----------------------------------------------------------

  await logAIJob(

    config,

    {

      requestedBy,

      contentType:
        "Note",

      subjectId,

      topicId,

      classId,

      prompt:
        teacherPrompt,

      aiOutput:
        aiText

    }

  );


  // ----------------------------------------------------------
  // RESPONSE
  // ----------------------------------------------------------

  return {

    message:
      "AI note generated successfully.",

    note: {

      id:
        created?.records?.[0]?.id ||
        null,

      ...raw,

      diagrams,

      visualComponents,

      status:
        "AI Draft"

    }

  };

}


// ============================================================
// GENERATE QUESTIONS
// ============================================================

async function generateQuestions(
  config,
  body
) {

  const subject =
    clean(body.subject);

  const subjectId =
    clean(body.subjectId);

  const topic =
    clean(body.topic);

  const className =
    clean(body.className) ||
    "SS1";

  const classId =
    clean(body.classId);

  const programme =
    clean(body.programme) ||
    "General";

  const requestedBy =
    clean(body.requestedBy);

  const teacherPrompt =
    clean(
      body.teacherPrompt ||
      body.prompt
    );

  const examTypes =
    normalizeExamTypes(
      body.examTypes
    );

     const count =
    Math.max(
      1,

      Math.min(
        100,

        Number(
          body.numberOfQuestions ||
          body.numberQuestions ||
          body.count ||
          body.questionCount ||
          1
        )

      )

    );


  const difficulty =
    clean(
      body.difficulty ||
      "Medium"
    );


  const bloomLevel =
    clean(
      body.bloomLevel ||
      "Apply"
    );


  const questionType =
    normalizeQuestionType(

      body.questionType ||
      "MCQ"

    );


  const source =
    clean(
      body.source ||
      "AI Generated"
    );


  const year =
    Number(
      body.year ||
      2026
    );


  const marks =
    Number(
      body.marks ||
      1
    );


  if (!subject) {

    throw new Error(
      "Subject is required."
    );

  }


  if (!topic) {

    throw new Error(
      "Topic is required."
    );

  }


  if (!teacherPrompt) {

    throw new Error(
      "Teacher prompt is required."
    );

  }


  const difficultyList =
    getDifficultyList(
      count,
      difficulty
    );


  const bloomList =
    getBloomList(
      count,
      bloomLevel
    );


  const generatedQuestions =
    [];


  // ----------------------------------------------------------
  // GENERATE IN BATCHES OF 10
  // ----------------------------------------------------------

  for (
    let start = 0;
    start < count;
    start += 10
  ) {

    const batchSize =
      Math.min(
        10,
        count - start
      );


    const assignments =
      Array.from(
        {
          length:
            batchSize
        },

        (_, i) =>
          `Question ${start + i + 1}: ` +
          `Difficulty=${difficultyList[start + i]}; ` +
          `Bloom=${bloomList[start + i]}`

      ).join("\n");


    const instructions = `

You are an expert Nigerian
secondary-school examination
question setter for AIBINU
FLEXIPREP EDUCONSULT.

Standards:

WAEC

NECO

UTME

The backend difficulty and Bloom
assignment is FINAL and must be
obeyed.

Return JSON only.

`;


    const input = `

RESPONSE FORMAT:

JSON


SUBJECT:
${subject}


CLASS:
${className}


PROGRAMME:
${programme}


TOPIC:
${topic}


EXAMINATION FOCUS:
${examTypes.join(", ")}


QUESTION TYPE:
${questionType}


TEACHER'S PROMPT:
${teacherPrompt}


GENERATE EXACTLY
${batchSize}
QUESTIONS.


MANDATORY ASSIGNMENTS:

${assignments}


For MCQ:

Use four options:

A

B

C

D

There must be exactly one
correct answer.

Use plausible distractors.

Do not use:

All of the above

None of the above


Return:

{
  "questions": [
    {
      "question": "",
      "optionA": "",
      "optionB": "",
      "optionC": "",
      "optionD": "",
      "correctAnswer": "A",
      "bloomLevel": "",
      "difficulty": "",
      "explanation": "",
      "questionType": "MCQ",
      "marks": 1,
      "source": "",
      "year": 2026
    }
  ]
}

`;


    const parsed =
      parseAIJSON(

        await callOpenAI(
          config,
          instructions,
          input
        )

      );


    if (
      !Array.isArray(
        parsed.questions
      )
    ) {

      throw new Error(
        "AI did not return a questions array."
      );

    }


    if (
      parsed.questions.length !==
      batchSize
    ) {

      throw new Error(

        `AI returned ${parsed.questions.length} ` +
        `questions instead of ${batchSize}.`

      );

    }


    parsed.questions.forEach(
      (question, i) => {

        const globalIndex =
          start + i;


        question.difficulty =
          difficultyList[
            globalIndex
          ];


        question.bloomLevel =
          bloomList[
            globalIndex
          ];


        question.questionType =
          normalizeQuestionType(
            questionType
          );


        question.marks =
          Number(
            question.marks ||
            marks ||
            1
          );


        question.source =
          clean(
            question.source ||
            source
          );


        question.year =
          Number(
            question.year ||
            year
          );


        question.correctAnswer =
          clean(
            question.correctAnswer
          ).toUpperCase();


        if (
          ![
            "A",
            "B",
            "C",
            "D"
          ].includes(
            question.correctAnswer
          )
        ) {

          throw new Error(

            `Invalid correct answer ` +
            `in Question ${globalIndex + 1}.`

          );

        }


        if (
          !clean(
            question.question
          )
        ) {

          throw new Error(

            `Question ${globalIndex + 1} ` +
            `has no question text.`

          );

        }


        if (
          !clean(question.optionA) ||
          !clean(question.optionB) ||
          !clean(question.optionC) ||
          !clean(question.optionD)
        ) {

          throw new Error(

            `Question ${globalIndex + 1} ` +
            `has incomplete options.`

          );

        }


        generatedQuestions.push(
          question
        );

      }

    );

  }


  // ==========================================================
  // AIRTABLE QUESTION RECORDS
  // ==========================================================

  const records =
    generatedQuestions.map(
      question => {

        const fields = {

          "Question ID":
            makeId("Q"),

          "Topic":
            topic,

          "Question":
            clean(
              question.question
            ),

          "Option A":
            clean(
              question.optionA
            ),

          "Option B":
            clean(
              question.optionB
            ),

          "Option C":
            clean(
              question.optionC
            ),

          "Option D":
            clean(
              question.optionD
            ),

          "Correct Answer":
            question.correctAnswer,

          "Bloom Level":
            normalizeBloom(
              question.bloomLevel
            ),

          "Difficulty":
            normalizeDifficulty(
              question.difficulty
            ),

          "Explanation":
            clean(
              question.explanation
            ),

          "Status":
            "Draft",

          "Publication Status":
            "Draft",

          "Question Type":
            normalizeQuestionType(
              question.questionType
            ),

          "Programme":
            programme,

          "Marks":
            Number(
              question.marks ||
              marks ||
              1
            ),

          "Source":
            clean(
              question.source ||
              source
            ),

          "Year":
            Number(
              question.year ||
              year
            ),

          "Exam Type":
            examTypes

        };


        if (
          subjectId
        ) {

          fields.Subject =
            [subjectId];

        }


        if (
          classId
        ) {

          fields.Class =
            [classId];

        }


        if (
          requestedBy
        ) {

          fields["Created By"] =
            [requestedBy];

        }


        return fields;

      }

    );


  // ==========================================================
  // CREATE QUESTIONS
  // ==========================================================

  const created =
    await createManyRecords(
      config,
      TABLES.QUESTIONS,
      records
    );


  // ==========================================================
  // LOG AI JOB
  // ==========================================================

  await logAIJob(

    config,

    {

      requestedBy,

      contentType:
        "Question",

      subjectId,

      topicId:
        null,

      classId,

      prompt:
        teacherPrompt,

      aiOutput:
        JSON.stringify(
          generatedQuestions
        )

    }

  );


  // ==========================================================
  // RESPONSE
  // ==========================================================

  return {

    message:
      `${generatedQuestions.length} ` +
      `AI questions generated successfully.`,

    count:
      generatedQuestions.length,

    questions:
      generatedQuestions.map(
        (question, i) => ({

          id:
            created[i]?.id ||
            null,

          questionId:
            records[i][
              "Question ID"
            ],

          ...question,

          status:
            "Draft",

          publicationStatus:
            "Draft"

        })

      )

  };

}
