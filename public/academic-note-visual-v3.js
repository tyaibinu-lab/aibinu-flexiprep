/* ============================================================
   AIBINU FLEXIPREP — NoteBank Visual Learning Engine v3
   Dynamic visual renderer for AI-generated NoteBank content.

   INSTALL in academic.html, immediately before </body>:
       <script src="/academic-note-visual-v3.js"></script>

   DESIGN:
   - Works for every subsequent /api/ai-content note generation.
   - Does not depend on window.currentAIResult.
   - Uses the existing fetch response.
   - AI supplies structured data; trusted frontend supplies behavior.
   - Never renders AI-provided executable code or arbitrary URLs.
   - Supports topic-neutral tables, processes, diagrams, graphs,
     equations, interactives and a growing simulation registry.
============================================================ */

(function () {
  "use strict";

  const MAX_VISUALS = 40;

  /* ----------------------------------------------------------
     Simulation registry.
     Adding a new simulation means adding a trusted renderer here;
     the AI cannot execute its own code.
  ---------------------------------------------------------- */

  const SIMS = {
    projectile_motion: {
      title: "Projectile Motion",
      defaults: {
        velocity: 20,
        angle: 45,
        gravity: 9.81
      }
    },

    ohms_law: {
      title: "Ohm's Law",
      defaults: {
        voltage: 12,
        resistance: 6
      }
    },

    hookes_law: {
      title: "Hooke's Law",
      defaults: {
        force: 5,
        springConstant: 50
      }
    },

    uniform_acceleration: {
      title: "Uniform Acceleration",
      defaults: {
        u: 5,
        acceleration: 2,
        time: 5
      }
    },

    simple_pendulum: {
      title: "Simple Pendulum",
      defaults: {
        length: 1,
        gravity: 9.81
      }
    },

    series_parallel_circuit: {
      title: "Series & Parallel Circuit",
      defaults: {
        resistance1: 4,
        resistance2: 6,
        voltage: 12
      }
    },

    wave_motion: {
      title: "Wave Motion",
      defaults: {
        amplitude: 1,
        frequency: 2,
        wavelength: 2
      }
    },

    lens_formula: {
      title: "Lens Formula",
      defaults: {
        focalLength: 10,
        objectDistance: 20
      }
    },

    transformer: {
      title: "Transformer",
      defaults: {
        primaryVoltage: 240,
        primaryTurns: 1000,
        secondaryTurns: 100
      }
    },

    density_pressure: {
      title: "Density and Pressure",
      defaults: {
        density: 1000,
        depth: 2,
        gravity: 9.81
      }
    },

    gas_law: {
      title: "Gas Law Explorer",
      defaults: {
        pressure: 100,
        volume: 1,
        temperature: 300
      }
    },

    probability: {
      title: "Probability Explorer",
      defaults: {
        favourable: 1,
        total: 6
      }
    },

    electromagnetic_induction: {
      title: "Electromagnetic Induction",
      defaults: {
        turns: 50,
        velocity: 2,
        magneticField: 0.5
      }
    },

    electrolysis: {
      title: "Electrolysis",
      defaults: {
        current: 2,
        time: 600,
        molarMass: 63.5,
        valency: 2
      }
    }
  };


  // ==========================================================
  // SAFETY HELPERS
  // ==========================================================

  const esc = v =>
    String(v ?? "").replace(
      /[&<>"']/g,
      s => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
      }[s])
    );

  const num = (v, fallback = 0) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  const clamp = (v, min, max) =>
    Math.max(min, Math.min(max, v));


  // ==========================================================
  // STYLES
  // ==========================================================

  function injectStyles() {
    if (document.getElementById("nbv3-styles")) return;

    const s = document.createElement("style");
    s.id = "nbv3-styles";

    s.textContent = `
      .nbv3-visuals {
        margin: 20px 0;
        display: grid;
        gap: 18px;
      }

      .nbv3-card {
        background: #fff;
        border: 1px solid #dfe7e2;
        border-radius: 16px;
        padding: 18px;
        box-shadow: 0 4px 16px rgba(0,0,0,.04);
      }

      .nbv3-title {
        font-size: 18px;
        font-weight: 800;
        margin-bottom: 12px;
        color: #17382b;
      }

      .nbv3-equation {
        font-family: Georgia, "Times New Roman", serif;
        font-size: 29px;
        text-align: center;
        padding: 22px;
        background: #f4f7f5;
        border-left: 5px solid #d7a62a;
        border-radius: 12px;
        overflow: auto;
      }

      .nbv3-equation sup,
      .nbv3-equation sub {
        font-size: .65em;
      }

      .nbv3-frac {
        display: inline-flex;
        flex-direction: column;
        vertical-align: middle;
        text-align: center;
        line-height: 1.05;
        margin: 0 .15em;
      }

      .nbv3-frac span:first-child {
        border-bottom: 1px solid currentColor;
        padding: 0 .2em;
      }

      .nbv3-frac span:last-child {
        padding: 0 .2em;
      }

      .nbv3-caption {
        margin-top: 9px;
        text-align: center;
        color: #66746d;
      }

      .nbv3-meta {
        margin-top: 8px;
        color: #66746d;
        font-size: 13px;
      }

      .nbv3-svg-wrap {
        width: 100%;
        overflow: auto;
        background: #fbfdfc;
        border-radius: 12px;
        padding: 8px;
      }

      .nbv3-svg-wrap svg {
        width: 100%;
        min-width: 520px;
        height: auto;
      }

      .nbv3-table-wrap {
        overflow-x: auto;
      }

      .nbv3-table {
        width: 100%;
        border-collapse: collapse;
        min-width: 520px;
      }

      .nbv3-table th,
      .nbv3-table td {
        border: 1px solid #dfe7e2;
        padding: 10px;
        text-align: left;
        vertical-align: top;
      }

      .nbv3-table th {
        background: #f4f7f5;
        font-weight: 800;
      }

      .nbv3-flow {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 10px;
      }

      .nbv3-step {
        padding: 12px 16px;
        border: 1px solid #dfe7e2;
        border-radius: 12px;
        background: #f8faf9;
        font-weight: 700;
      }

      .nbv3-arrow {
        font-size: 22px;
        font-weight: 800;
      }

      .nbv3-slider {
        display: grid;
        grid-template-columns: minmax(150px, 220px) 1fr 75px;
        gap: 10px;
        align-items: center;
        margin: 9px 0;
      }

      .nbv3-slider input {
        width: 100%;
      }

      .nbv3-slider output {
        font-weight: 700;
      }

      .nbv3-canvas {
        display: block;
        width: 100%;
        height: auto;
        background: #fbfdfc;
        border: 1px solid #dfe7e2;
        border-radius: 12px;
        margin-top: 14px;
      }

      .nbv3-result {
        margin-top: 10px;
        padding: 11px;
        border-radius: 10px;
        background: #f4f7f5;
        font-weight: 700;
      }

      .nbv3-image-spec {
        padding: 16px;
        background: #f8faf9;
        border-radius: 12px;
      }

      @media (max-width: 650px) {
        .nbv3-slider {
          grid-template-columns: 1fr;
        }

        .nbv3-equation {
          font-size: 22px;
        }

        .nbv3-flow {
          display: grid;
        }

        .nbv3-arrow {
          transform: rotate(90deg);
          justify-self: center;
        }
      }
    `;

    document.head.appendChild(s);
  }


  // ==========================================================
  // EQUATION FORMATTER
  // ==========================================================

  function formatEquation(latex) {
    let s = esc(latex || "");

     // Remove LaTeX escaped spaces so they don't appear as literal "\ "
    s = s.replace(/\\ /g, " ");

    // --------------------------------------------------------
    // Remove common math delimiters
    // --------------------------------------------------------

    s = s.replace(/\$\$/g, "");
    s = s.replace(/\$/g, "");
    s = s.replace(/\\\[/g, "");
    s = s.replace(/\\\]/g, "");
    s = s.replace(/\\\(/g, "");
    s = s.replace(/\\\)/g, "");

    // --------------------------------------------------------
    // LaTeX spacing commands
    // --------------------------------------------------------

    s = s.replace(/\\qquad/g, "  ");
    s = s.replace(/\\quad/g, " ");
    s = s.replace(/\\,/g, " ");
    s = s.replace(/\\;/g, " ");
    s = s.replace(/\\:/g, " ");
    s = s.replace(/\\!/g, "");

    // --------------------------------------------------------
    // Fractions
    // --------------------------------------------------------

    s = s.replace(
      /\\frac\s*\{([^{}]*)\}\s*\{([^{}]*)\}/g,
      '<span class="nbv3-frac"><span>$1</span><span>$2</span></span>'
    );

    // --------------------------------------------------------
    // Square roots
    // --------------------------------------------------------

    s = s.replace(
      /\\sqrt\s*\{([^{}]*)\}/g,
      "√($1)"
    );

    // --------------------------------------------------------
    // Basic operators
    // --------------------------------------------------------

    s = s.replace(/\\times/g, " × ");
    s = s.replace(/\\cdot/g, " · ");
    s = s.replace(/\\pm/g, " ± ");
    s = s.replace(/\\mp/g, " ∓ ");

    // --------------------------------------------------------
    // Greek symbols
    // --------------------------------------------------------

    s = s
      .replace(/\\Gamma/g, "Γ")
      .replace(/\\Delta/g, "Δ")
      .replace(/\\Lambda/g, "Λ")
      .replace(/\\Theta/g, "Θ")
      .replace(/\\Pi/g, "Π")
      .replace(/\\Sigma/g, "Σ")
      .replace(/\\Phi/g, "Φ")
      .replace(/\\Psi/g, "Ψ")
      .replace(/\\Omega/g, "Ω")
      .replace(/\\alpha/g, "α")
      .replace(/\\beta/g, "β")
      .replace(/\\gamma/g, "γ")
      .replace(/\\delta/g, "δ")
      .replace(/\\epsilon/g, "ε")
      .replace(/\\varepsilon/g, "ε")
      .replace(/\\zeta/g, "ζ")
      .replace(/\\eta/g, "η")
      .replace(/\\theta/g, "θ")
      .replace(/\\vartheta/g, "ϑ")
      .replace(/\\iota/g, "ι")
      .replace(/\\kappa/g, "κ")
      .replace(/\\lambda/g, "λ")
      .replace(/\\mu/g, "μ")
      .replace(/\\nu/g, "ν")
      .replace(/\\xi/g, "ξ")
      .replace(/\\pi/g, "π")
      .replace(/\\varpi/g, "ϖ")
      .replace(/\\rho/g, "ρ")
      .replace(/\\varrho/g, "ϱ")
      .replace(/\\sigma/g, "σ")
      .replace(/\\varsigma/g, "ς")
      .replace(/\\tau/g, "τ")
      .replace(/\\upsilon/g, "υ")
      .replace(/\\phi/g, "φ")
      .replace(/\\varphi/g, "ϕ")
      .replace(/\\chi/g, "χ")
      .replace(/\\psi/g, "ψ")
      .replace(/\\omega/g, "ω");

    // --------------------------------------------------------
    // Trigonometric / mathematical functions
    // --------------------------------------------------------

    s = s.replace(
      /\\(cos|sin|tan|log|ln)/g,
      "$1"
    );

    // --------------------------------------------------------
    // Arrows and mathematical symbols
    // --------------------------------------------------------

    s = s
      .replace(/\\rightleftharpoons/g, "⇌")
      .replace(/\\longrightarrow/g, "→")
      .replace(/\\rightarrow/g, "→")
      .replace(/\\arrow/g, "→")
      .replace(/\\longarrow/g, "→")
      .replace(/\\xrightarrow/g, "→")
      .replace(/\\to/g, "→")
      .replace(/\\Rightarrow/g, "⇒")
      .replace(/\\leftarrow/g, "←")
      .replace(/\\leftrightarrow/g, "↔")
      .replace(/\\approx/g, "≈")
      .replace(/\\neq/g, "≠")
      .replace(/\\geq/g, "≥")
      .replace(/\\leq/g, "≤")
      .replace(/\\propto/g, "∝")
      .replace(/\\infty/g, "∞")
      .replace(/\\perp/g, "⊥")
      .replace(/\\parallel/g, "∥")
      .replace(/\\angle/g, "∠")
      .replace(/\\therefore/g, "∴")
      .replace(/\\because/g, "∵")
      .replace(/\\circ/g, "°")
      .replace(/\\degree/g, "°")
      .replace(/\\%/g, "%");

    // --------------------------------------------------------
    // Raw chemistry arrows
    // --------------------------------------------------------

    s = s.replace(/<->/g, "↔");
    s = s.replace(/->/g, "→");
    s = s.replace(/<-/g, "←");

    // --------------------------------------------------------
    // Remove LaTeX sizing commands
    // --------------------------------------------------------

    s = s.replace(/\\left/g, "");
    s = s.replace(/\\right/g, "");

    // --------------------------------------------------------
    // Text / math wrappers
    //
    // Supports:
    //
    // \mathrm{Cu}
    //
    // and:
    //
    // \mathrm{Cu^{2+}+2e^- \arrow Cu}
    //
    // which contains nested braces.
    // --------------------------------------------------------

    s = s.replace(
      /\\(text|mathrm|mathbf|mathit)\{((?:[^{}]|\{[^{}]*\})*)\}/g,
      "$2"
    );

    // Additional simple wrappers

    s = s.replace(
      /\\textbf\{([^{}]*)\}/g,
      "$1"
    );

    s = s.replace(
      /\\textit\{([^{}]*)\}/g,
      "$1"
    );

    // --------------------------------------------------------
    // Superscripts
    // --------------------------------------------------------

    s = s.replace(
      /\^(\{([^{}]+)\}|([A-Za-z0-9+\-]+))/g,
      (_, all, a, b) =>
        `<sup>${a || b}</sup>`
    );

    // --------------------------------------------------------
    // Subscripts
    //
    // Supports:
    //   H_2
    //   C_6
    //   C_6H_{12}O_6
    // --------------------------------------------------------

    s = s.replace(
      /_(\{([^{}]+)\}|([0-9]+))/g,
      (_, all, a, b) =>
        `<sub>${a || b}</sub>`
    );

    // Single-letter symbolic subscript

    s = s.replace(
      /_([A-Za-z])/g,
      "<sub>$1</sub>"
    );

    // --------------------------------------------------------
    // Remove structural braces
    // --------------------------------------------------------

    s = s.replace(/[{}]/g, "");

    // --------------------------------------------------------
    // Remove remaining harmless LaTeX commands
    // --------------------------------------------------------

    s = s.replace(
      /\\([A-Za-z]+)\b/g,
      "$1"
    );

    // --------------------------------------------------------
    // Final whitespace cleanup
    // --------------------------------------------------------

    s = s.replace(/\s{3,}/g, " ");

    return s.trim();
  }


  function renderEquation(v) {
    const el =
      document.createElement("article");

    el.className =
      "nbv3-card";

    el.innerHTML = `
      <div class="nbv3-title">
        📐 Equation
      </div>

      <div class="nbv3-equation">
        ${formatEquation(v.latex)}
      </div>

      <div class="nbv3-caption">
        ${esc(v.caption || "Key equation")}
      </div>

      ${
        v.variables
          ? `<div class="nbv3-meta">
              ${esc(v.variables)}
             </div>`
          : ""
      }
    `;

    return el;
  }


  // ==========================================================
  // SVG / DIAGRAMS
  // ==========================================================

  function svg(inner, label) {
    return `
      <svg
        viewBox="0 0 720 360"
        role="img"
        aria-label="${esc(label)}"
        xmlns="http://www.w3.org/2000/svg">

        ${inner}

      </svg>
    `;
  }


  function line(
    x1,
    y1,
    x2,
    y2,
    extra = ""
  ) {
    return `
      <line
        x1="${x1}"
        y1="${y1}"
        x2="${x2}"
        y2="${y2}"
        stroke="currentColor"
        stroke-width="2"
        ${extra}/>
    `;
  }


  function txt(
    x,
    y,
    value,
    extra = ""
  ) {
    return `
      <text
        x="${x}"
        y="${y}"
        font-family="Arial,sans-serif"
        font-size="18"
        fill="currentColor"
        ${extra}>
        ${esc(value)}
      </text>
    `;
  }


  function drawDiagram(type, labels, context = "") {
    let t =
      String(type || "").toLowerCase();

    const L =
      Array.isArray(labels)
        ? labels
        : [];

    // --------------------------------------------------------
    // Strengthened electrolysis detection.
    //
    // The AI may sometimes return "circuit" even when the
    // description clearly says electrolytic cell.
    //
    // We therefore inspect the complete visual context before
    // allowing the generic circuit renderer to run.
    // --------------------------------------------------------

    const visualContext =
      [
        type,
        context,
        ...L
      ]
        .join(" ")
        .toLowerCase();

    const isElectrolysis =
      visualContext.includes("electroly") ||
      visualContext.includes("electrode") ||
      visualContext.includes("anode") ||
      visualContext.includes("cathode") ||
      visualContext.includes("cuso4") ||
      visualContext.includes("cu2+") ||
      visualContext.includes("copper(ii) sulfate") ||
      visualContext.includes("copper sulfate");

    if (isElectrolysis) {
      t = "electrolytic_cell";
    }


    // --------------------------------------------------------
    // Projectile
    // --------------------------------------------------------

    if (t.includes("projectile")) {
      return svg(`
        <path
          d="M90 285 Q260 55 600 255"
          fill="none"
          stroke="currentColor"
          stroke-width="4"/>

        ${line(70,285,650,285)}
        ${line(90,300,90,45)}

        <circle
          cx="90"
          cy="285"
          r="9"
          fill="currentColor"/>

        ${txt(105,275,"launch")}
        ${txt(485,245,"trajectory")}
        ${txt(30,55,"y")}
        ${txt(625,310,"x")}

      `, "Projectile motion diagram");
    }


    // --------------------------------------------------------
    // Wave
    // --------------------------------------------------------

    if (t.includes("wave")) {
      return svg(`
        ${line(50,180,670,180)}

        <path
          d="M50 180
             C90 80 130 80 170 180
             S250 280 290 180
             S370 80 410 180
             S490 280 530 180
             S610 80 650 180"
          fill="none"
          stroke="currentColor"
          stroke-width="4"/>

        ${txt(270,75,"wavelength λ")}
        ${txt(310,215,"equilibrium")}

      `, "Wave diagram");
    }


    // --------------------------------------------------------
    // Ray / reflection / refraction
    // --------------------------------------------------------

    if (
      t.includes("ray") ||
      t.includes("reflection") ||
      t.includes("refraction")
    ) {
      return svg(`
        ${line(70,270,650,270)}

        ${line(
          360,
          60,
          360,
          320,
          "stroke-dasharray='8 7'"
        )}

        ${line(110,215,360,270)}
        ${line(360,270,610,125)}

        ${txt(85,205,"incident ray")}
        ${txt(500,120,"reflected/refracted ray")}
        ${txt(375,85,"normal")}
        ${txt(520,300,"surface")}

      `, "Ray diagram");
    }
       // --------------------------------------------------------
    // ELECTROLYTIC CELL
    //
    // IMPORTANT:
    // This check is deliberately before generic "circuit".
    // --------------------------------------------------------

    if (
      t.includes("electroly") ||
      t.includes("electrode") ||
      t.includes("anode") ||
      t.includes("cathode")
    ) {
      return svg(`
        <!-- Electrolyte container -->

        <rect
          x="190"
          y="95"
          width="340"
          height="190"
          rx="10"
          fill="none"
          stroke="currentColor"
          stroke-width="3"/>

        <!-- Electrolyte -->

        <rect
          x="195"
          y="145"
          width="330"
          height="135"
          fill="currentColor"
          opacity=".08"/>

        <!-- Anode -->

        <rect
          x="250"
          y="125"
          width="28"
          height="130"
          rx="4"
          fill="currentColor"
          opacity=".75"/>

        <!-- Cathode -->

        <rect
          x="442"
          y="125"
          width="28"
          height="130"
          rx="4"
          fill="currentColor"
          opacity=".75"/>

        <!-- Power supply -->

        <rect
          x="285"
          y="25"
          width="150"
          height="55"
          rx="8"
          fill="white"
          stroke="currentColor"
          stroke-width="3"/>

        ${txt(
          315,
          59,
          "DC POWER SUPPLY"
        )}

        <!-- Wires -->

        ${line(
          264,
          125,
          264,
          80
        )}

        ${line(
          264,
          80,
          330,
          80
        )}

        ${line(
          330,
          80,
          330,
          25
        )}

        ${line(
          456,
          125,
          456,
          80
        )}

        ${line(
          456,
          80,
          390,
          80
        )}

        ${line(
          390,
          80,
          390,
          25
        )}

        <!-- Polarity -->

        ${txt(
          235,
          118,
          "+"
        )}

        ${txt(
          458,
          118,
          "−"
        )}

        <!-- Ion movement -->

        <path
          d="M310 190 L400 190"
          fill="none"
          stroke="currentColor"
          stroke-width="2"/>

        <path
          d="M390 180 L405 190 L390 200"
          fill="none"
          stroke="currentColor"
          stroke-width="2"/>

        <path
          d="M410 225 L320 225"
          fill="none"
          stroke="currentColor"
          stroke-width="2"/>

        <path
          d="M330 215 L315 225 L330 235"
          fill="none"
          stroke="currentColor"
          stroke-width="2"/>

        <!-- Labels -->

        ${txt(
          215,
          115,
          "Anode (+)"
        )}

        ${txt(
          475,
          115,
          "Cathode (−)"
        )}

        ${txt(
          300,
          165,
          "Electrolyte"
        )}

        ${txt(
          325,
          185,
          "Cations →"
        )}

        ${txt(
          325,
          250,
          "← Anions"
        )}

        ${txt(
          205,
          315,
          "Positive ions move toward the cathode"
        )}

        ${txt(
          205,
          340,
          "Negative ions move toward the anode"
        )}

      `, "Labelled electrolytic cell showing anode, cathode, electrolyte and ion movement");
    }


    // --------------------------------------------------------
    // Circuit
    // --------------------------------------------------------

    if (t.includes("circuit")) {
      return svg(`
        ${line(
          120,
          90,
          600,
          90
        )}

        ${line(
          120,
          270,
          600,
          270
        )}

        ${line(
          120,
          90,
          120,
          155
        )}

        ${line(
          120,
          205,
          120,
          270
        )}

        ${line(
          600,
          90,
          600,
          270
        )}

        <rect
          x="105"
          y="155"
          width="30"
          height="50"
          fill="white"
          stroke="currentColor"
          stroke-width="3"/>

        ${line(
          95,
          165,
          135,
          165
        )}

        ${line(
          100,
          195,
          130,
          195
        )}

        <rect
          x="330"
          y="245"
          width="100"
          height="50"
          fill="white"
          stroke="currentColor"
          stroke-width="3"/>

        ${txt(
          348,
          277,
          "resistor"
        )}

        ${txt(
          78,
          145,
          "cell"
        )}

      `, "Simple circuit diagram");
    }


    // --------------------------------------------------------
    // Free-body / force
    // --------------------------------------------------------

    if (
      t.includes("free_body") ||
      t.includes("force")
    ) {
      return svg(`
        <rect
          x="280"
          y="145"
          width="160"
          height="100"
          fill="white"
          stroke="currentColor"
          stroke-width="3"/>

        ${line(
          360,
          145,
          360,
          65
        )}

        ${line(
          440,
          195,
          590,
          195
        )}

        ${line(
          280,
          195,
          130,
          195
        )}

        ${line(
          360,
          245,
          360,
          325
        )}

        ${txt(
          330,
          200,
          "object"
        )}

        ${txt(
          370,
          70,
          "weight"
        )}

        ${txt(
          470,
          180,
          "force"
        )}

      `, "Free body diagram");
    }


    // --------------------------------------------------------
    // Generic biological cell
    // --------------------------------------------------------

    if (t.includes("cell")) {
      return svg(`
        <ellipse
          cx="360"
          cy="180"
          rx="170"
          ry="110"
          fill="none"
          stroke="currentColor"
          stroke-width="3"/>

        <circle
          cx="300"
          cy="145"
          r="28"
          fill="none"
          stroke="currentColor"
          stroke-width="3"/>

        <circle
          cx="420"
          cy="215"
          r="35"
          fill="none"
          stroke="currentColor"
          stroke-width="3"/>

        ${txt(
          265,
          145,
          "nucleus"
        )}

        ${txt(
          450,
          220,
          "organelle"
        )}

      `, "Cell diagram");
    }


    // --------------------------------------------------------
    // Magnet / coil / induction
    // --------------------------------------------------------

    if (
      t.includes("magnet") ||
      t.includes("coil") ||
      t.includes("solenoid") ||
      t.includes("induction")
    ) {
      return svg(`
        ${line(
          70,
          270,
          650,
          270
        )}

        <rect
          x="90"
          y="145"
          width="70"
          height="70"
          fill="currentColor"
          opacity=".85"/>

        ${txt(
          112,
          190,
          "N"
        )}

        ${[
          0,
          1,
          2,
          3,
          4,
          5
        ].map(i => `
          <ellipse
            cx="${420 + i * 22}"
            cy="180"
            rx="20"
            ry="65"
            fill="none"
            stroke="currentColor"
            stroke-width="2"/>
        `).join("")}

        ${line(
          420,
          115,
          420,
          70
        )}

        ${line(
          420,
          70,
          610,
          70
        )}

        ${line(
          610,
          70,
          610,
          140
        )}

        ${line(
          530,
          245,
          530,
          300
        )}

        ${line(
          530,
          300,
          610,
          300
        )}

        ${line(
          610,
          300,
          610,
          220
        )}

        <circle
          cx="610"
          cy="180"
          r="35"
          fill="none"
          stroke="currentColor"
          stroke-width="2"/>

        ${txt(
          600,
          187,
          "G"
        )}

        <path
          d="
            M170 180
            L260 180
            M245 168
            L262 180
            L245 192
          "
          fill="none"
          stroke="currentColor"
          stroke-width="2"/>

        ${txt(
          175,
          155,
          "motion"
        )}

        ${txt(
          80,
          230,
          "bar magnet"
        )}

        ${txt(
          460,
          320,
          "coil / solenoid"
        )}

        ${txt(
          575,
          235,
          "galvanometer"
        )}

      `, "Bar magnet moving into a coil");
    }


    // --------------------------------------------------------
    // Generic labelled diagram
    // --------------------------------------------------------

    const items =
      L.slice(0, 12)
        .map((x, i) => `
          <rect
            x="${55 + (i % 3) * 220}"
            y="${60 + Math.floor(i / 3) * 65}"
            width="195"
            height="42"
            rx="8"
            fill="currentColor"
            opacity=".08"/>

          ${txt(
            70 + (i % 3) * 220,
            87 + Math.floor(i / 3) * 65,
            x
          )}
        `)
        .join("");

    return svg(`
      <rect
        x="35"
        y="35"
        width="650"
        height="290"
        rx="16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        stroke-dasharray="8 8"/>

      ${
        items ||
        txt(
          220,
          185,
          "Teacher-directed labelled diagram"
        )
      }

    `, "Educational diagram");
  }


  function renderDiagram(v) {
    const el =
      document.createElement("article");

    el.className =
      "nbv3-card";

    const context =
      [
        v.title || "",
        v.description || "",
        v.caption || "",
        Array.isArray(v.labels)
          ? v.labels.join(" ")
          : ""
      ].join(" ");

    el.innerHTML = `
      <div class="nbv3-title">
        🔬 ${esc(
          v.title ||
          "Educational Diagram"
        )}
      </div>

      <div class="nbv3-svg-wrap">
        ${drawDiagram(
          v.diagram,
          v.labels,
          context
        )}
      </div>

      <p>
        ${esc(
          v.description ||
          "Study the labelled diagram carefully."
        )}
      </p>
    `;

    return el;
  }


  // ==========================================================
  // TABLE / COMPARISON
  // ==========================================================

  function renderTable(
    v,
    comparison = false
  ) {
    const el =
      document.createElement("article");

    el.className =
      "nbv3-card";

    const headers =
      Array.isArray(v.headers)
        ? v.headers.slice(0, 12)
        : [];

    const rows =
      Array.isArray(v.rows)
        ? v.rows.slice(0, 40)
        : [];

    el.innerHTML = `
      <div class="nbv3-title">
        ${comparison ? "⚖️" : "📋"}

        ${esc(
          v.title ||
          (
            comparison
              ? "Comparison"
              : "Study Table"
          )
        )}
      </div>

      <div class="nbv3-table-wrap">
        <table class="nbv3-table">

          <thead>
            <tr>
              ${headers
                .map(
                  h =>
                    `<th>${esc(h)}</th>`
                )
                .join("")}
            </tr>
          </thead>

          <tbody>
            ${rows
              .map(row => `
                <tr>
                  ${
                    Array.isArray(row)
                      ? row
                          .slice(
                            0,
                            headers.length || 12
                          )
                          .map(
                            cell =>
                              `<td>${esc(cell)}</td>`
                          )
                          .join("")
                      : ""
                  }
                </tr>
              `)
              .join("")}
          </tbody>

        </table>
      </div>

      ${
        v.caption
          ? `<div class="nbv3-caption">
              ${esc(v.caption)}
             </div>`
          : ""
      }
    `;

    return el;
  }


  // ==========================================================
  // FLOWCHART / PROCESS
  // ==========================================================

  function renderFlow(
    v,
    process = false
  ) {
    const el =
      document.createElement("article");

    el.className =
      "nbv3-card";

    const steps =
      Array.isArray(v.steps)
        ? v.steps.slice(0, 20)
        : [];

    el.innerHTML = `
      <div class="nbv3-title">
        ${process ? "⚙️" : "➡️"}

        ${esc(
          v.title ||
          (
            process
              ? "Process"
              : "Flow"
          )
        )}
      </div>

      <div class="nbv3-flow">

        ${steps
          .map(
            (step, i) => `
              ${
                i > 0
                  ? `<div
                       class="nbv3-arrow"
                       aria-hidden="true">
                       →
                     </div>`
                  : ""
              }

              <div class="nbv3-step">
                ${esc(step)}
              </div>
            `
          )
          .join("")}

      </div>

      ${
        v.caption
          ? `<div class="nbv3-caption">
              ${esc(v.caption)}
             </div>`
          : ""
      }
    `;

    return el;
  }

   // ==========================================================
  // GRAPH
  // ==========================================================

  function renderGraph(v) {
    const el =
      document.createElement("article");

    el.className =
      "nbv3-card";

    const points =
      (
        Array.isArray(v.data)
          ? v.data
          : []
      )
        .map(p => [
          num(p?.[0], NaN),
          num(p?.[1], NaN)
        ])
        .filter(
          p =>
            Number.isFinite(p[0]) &&
            Number.isFinite(p[1])
        )
        .slice(0, 100);

    const xs =
      points.map(p => p[0]);

    const ys =
      points.map(p => p[1]);

    const xmin =
      xs.length
        ? Math.min(...xs)
        : 0;

    const xmax =
      xs.length
        ? Math.max(...xs)
        : 1;

    const ymin =
      ys.length
        ? Math.min(...ys)
        : 0;

    const ymax =
      ys.length
        ? Math.max(...ys)
        : 1;

    const dx =
      xmax - xmin || 1;

    const dy =
      ymax - ymin || 1;

    const plotted =
      points
        .map(p => {
          const x =
            70 +
            ((p[0] - xmin) / dx) *
              590;

          const y =
            295 -
            ((p[1] - ymin) / dy) *
              245;

          return `${x},${y}`;
        })
        .join(" ");

    el.innerHTML = `
      <div class="nbv3-title">
        📈 ${esc(
          v.title ||
          "Graph"
        )}
      </div>

      <div class="nbv3-svg-wrap">

        ${svg(`
          ${line(
            70,
            295,
            660,
            295
          )}

          ${line(
            70,
            295,
            70,
            50
          )}

          ${
            plotted
              ? `
                <polyline
                  points="${plotted}"
                  fill="none"
                  stroke="currentColor"
                  stroke-width="4"/>

                ${points
                  .map(p => {
                    const x =
                      70 +
                      ((p[0] - xmin) / dx) *
                        590;

                    const y =
                      295 -
                      ((p[1] - ymin) / dy) *
                        245;

                    return `
                      <circle
                        cx="${x}"
                        cy="${y}"
                        r="5"
                        fill="currentColor"/>
                    `;
                  })
                  .join("")}
              `
              : txt(
                  250,
                  185,
                  "No numerical data supplied"
                )
          }

          ${txt(
            320,
            335,
            v.xLabel ||
              "x"
          )}

          ${txt(
            18,
            70,
            v.yLabel ||
              "y"
          )}

        `,
        v.title ||
          "Graph")}

      </div>

      <div class="nbv3-meta">
        X:
        ${esc(
          v.xLabel ||
          "x"
        )}

        &nbsp;&nbsp;|&nbsp;&nbsp;

        Y:
        ${esc(
          v.yLabel ||
          "y"
        )}
      </div>
    `;

    return el;
  }


  // ==========================================================
  // GENERIC INTERACTIVE
  // ==========================================================

  function renderInteractive(v) {
    const el =
      document.createElement("article");

    el.className =
      "nbv3-card";

    el.innerHTML = `
      <div class="nbv3-title">
        🎛️ ${esc(
          v.title ||
          "Interactive Exploration"
        )}
      </div>

      <p>
        ${esc(
          v.instructions ||
          "Adjust the variables and observe the values."
        )}
      </p>

      <div
        class="nbv3-interactive-controls">
      </div>

      <div
        class="nbv3-result"
        aria-live="polite">
        Adjust a parameter to explore.
      </div>
    `;

    const controls =
      el.querySelector(
        ".nbv3-interactive-controls"
      );

    const result =
      el.querySelector(
        ".nbv3-result"
      );

    const params =
      Array.isArray(
        v.parameters
      )
        ? v.parameters.slice(
            0,
            12
          )
        : [];

    function update() {
      const values = {};

      controls
        .querySelectorAll(
          "input[data-name]"
        )
        .forEach(
          input => {
            values[
              input.dataset.name
            ] =
              Number(
                input.value
              );
          }
        );

      result.textContent =
        Object.entries(values)
          .map(
            ([k, val]) =>
              `${k} = ${val}`
          )
          .join(
            "  |  "
          ) ||
        "Adjust a parameter to explore.";
    }

    params.forEach(
      p => {

        let min =
          num(
            p?.min,
            0
          );

        let max =
          num(
            p?.max,
            100
          );

        if (
          max <= min
        ) {
          max =
            min + 100;
        }

        const step =
          num(
            p?.step,
            1
          ) > 0
            ? num(
                p.step,
                1
              )
            : 1;

        const value =
          clamp(
            num(
              p?.value,
              min
            ),
            min,
            max
          );

        const row =
          document.createElement(
            "label"
          );

        row.className =
          "nbv3-slider";

        row.innerHTML = `
          <span>
            ${esc(
              p?.name ||
              "Parameter"
            )}
          </span>

          <input
            data-name="${esc(
              p?.name ||
              "Parameter"
            )}"
            type="range"
            min="${min}"
            max="${max}"
            step="${step}"
            value="${value}">

          <output>
            ${value}
          </output>
        `;

        const input =
          row.querySelector(
            "input"
          );

        const output =
          row.querySelector(
            "output"
          );

        input.addEventListener(
          "input",
          () => {

            output.value =
              input.value;

            update();
          }
        );

        controls.appendChild(
          row
        );
      }
    );

    update();

    return el;
  }


  // ==========================================================
  // SIMULATION COMMON UI
  // ==========================================================

  function slider(
    container,
    label,
    value,
    min,
    max,
    step,
    onChange
  ) {

    const row =
      document.createElement(
        "label"
      );

    row.className =
      "nbv3-slider";

    row.innerHTML = `
      <span>
        ${esc(label)}
      </span>

      <input
        type="range"
        min="${min}"
        max="${max}"
        step="${step}"
        value="${value}">

      <output>
        ${value}
      </output>
    `;

    const input =
      row.querySelector(
        "input"
      );

    const output =
      row.querySelector(
        "output"
      );

    input.addEventListener(
      "input",
      () => {

        output.value =
          input.value;

        onChange(
          Number(
            input.value
          )
        );
      }
    );

    container.appendChild(
      row
    );
  }


  // ==========================================================
  // SIMULATION RENDERER
  // ==========================================================

  function renderSimulation(v) {

    const type =
      String(
        v.simulation ||
        ""
      ).toLowerCase();

    if (
      !SIMS[type]
    ) {
      return null;
    }

    const state = {
      ...SIMS[type].defaults,
      ...(v.variables || {})
    };

    const el =
      document.createElement(
        "article"
      );

    el.className =
      "nbv3-card";

    el.innerHTML = `
      <div class="nbv3-title">
        🧪 ${esc(
          v.title ||
          SIMS[type].title
        )}
      </div>

      <p>
        ${esc(
          v.instructions ||
          "Adjust the controls and observe the result."
        )}
      </p>

      <div
        class="nbv3-sim-controls">
      </div>

      <canvas
        class="nbv3-canvas"
        width="760"
        height="360"
        role="img"
        aria-label="${esc(
          v.title ||
          SIMS[type].title
        )}">
      </canvas>

      <div
        class="nbv3-result"
        aria-live="polite">
      </div>
    `;

    const controls =
      el.querySelector(
        ".nbv3-sim-controls"
      );

    const canvas =
      el.querySelector(
        "canvas"
      );

    const ctx =
      canvas.getContext(
        "2d"
      );

    const result =
      el.querySelector(
        ".nbv3-result"
      );


    // ========================================================
    // DRAWING HELPERS
    // ========================================================

    function clear() {

      ctx.clearRect(
        0,
        0,
        canvas.width,
        canvas.height
      );

      ctx.fillStyle =
        "#222";

      ctx.strokeStyle =
        "#222";

      ctx.lineWidth =
        2;

      ctx.font =
        "16px Arial";

      ctx.textAlign =
        "left";
    }


    // ========================================================
    // PROJECTILE MOTION
    // ========================================================

    function projectile() {

      clear();

      const u =
        clamp(
          num(
            state.velocity,
            20
          ),
          1,
          100
        );

      const angle =
        clamp(
          num(
            state.angle,
            45
          ),
          5,
          85
        ) *
        Math.PI /
        180;

      const g =
        clamp(
          num(
            state.gravity,
            9.81
          ),
          .1,
          30
        );

      const T =
        2 *
        u *
        Math.sin(
          angle
        ) /
        g;

      const R =
        u *
        u *
        Math.sin(
          2 * angle
        ) /
        g;

      const H =
        u *
        u *
        Math.sin(
          angle
        ) ** 2 /
        (
          2 * g
        );

      ctx.beginPath();

      for (
        let i = 0;
        i <= 100;
        i++
      ) {

        const t =
          T *
          i /
          100;

        const x =
          u *
          Math.cos(
            angle
          ) *
          t;

        const y =
          u *
          Math.sin(
            angle
          ) *
          t -
          .5 *
          g *
          t *
          t;

        const px =
          45 +
          (
            x /
            Math.max(
              R,
              1
            )
          ) *
          650;

        const py =
          300 -
          (
            y /
            Math.max(
              H,
              1
            )
          ) *
          240;

        i
          ? ctx.lineTo(
              px,
              py
            )
          : ctx.moveTo(
              px,
              py
            );
      }

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(
        40,
        300
      );

      ctx.lineTo(
        710,
        300
      );

      ctx.stroke();

      result.textContent =
        `Range = ${R.toFixed(2)} m | ` +
        `Maximum height = ${H.toFixed(2)} m | ` +
        `Time = ${T.toFixed(2)} s`;
    }

       // ========================================================
    // OHM'S LAW
    // ========================================================

    function ohm() {

      clear();

      const V =
        clamp(
          num(
            state.voltage,
            12
          ),
          0,
          50
        );

      const R =
        clamp(
          num(
            state.resistance,
            6
          ),
          .1,
          100
        );

      const I =
        V / R;

      // ------------------------------------------------------
      // Circuit representation
      // ------------------------------------------------------

      ctx.strokeStyle =
        "#333";

      ctx.lineWidth =
        3;

      ctx.beginPath();

      ctx.moveTo(
        90,
        80
      );

      ctx.lineTo(
        670,
        80
      );

      ctx.lineTo(
        670,
        280
      );

      ctx.lineTo(
        90,
        280
      );

      ctx.lineTo(
        90,
        80
      );

      ctx.stroke();

      // ------------------------------------------------------
      // Battery
      // ------------------------------------------------------

      ctx.lineWidth =
        4;

      ctx.beginPath();

      ctx.moveTo(
        135,
        130
      );

      ctx.lineTo(
        135,
        230
      );

      ctx.moveTo(
        160,
        145
      );

      ctx.lineTo(
        160,
        215
      );

      ctx.stroke();

      ctx.font =
        "bold 18px Arial";

      ctx.fillText(
        "+",
        126,
        120
      );

      ctx.fillText(
        "−",
        151,
        245
      );

      // ------------------------------------------------------
      // Resistor
      // ------------------------------------------------------

      ctx.beginPath();

      ctx.moveTo(
        300,
        80
      );

      ctx.lineTo(
        320,
        80
      );

      ctx.lineTo(
        335,
        60
      );

      ctx.lineTo(
        365,
        100
      );

      ctx.lineTo(
        395,
        60
      );

      ctx.lineTo(
        425,
        100
      );

      ctx.lineTo(
        440,
        80
      );

      ctx.lineTo(
        470,
        80
      );

      ctx.stroke();

      ctx.font =
        "16px Arial";

      ctx.fillText(
        `R = ${R.toFixed(1)} Ω`,
        330,
        135
      );

      // ------------------------------------------------------
      // Current arrow
      // ------------------------------------------------------

      ctx.beginPath();

      ctx.moveTo(
        500,
        80
      );

      ctx.lineTo(
        590,
        80
      );

      ctx.lineTo(
        575,
        70
      );

      ctx.moveTo(
        590,
        80
      );

      ctx.lineTo(
        575,
        90
      );

      ctx.stroke();

      ctx.fillText(
        `I = ${I.toFixed(2)} A`,
        500,
        55
      );

      // ------------------------------------------------------
      // Voltage
      // ------------------------------------------------------

      ctx.fillText(
        `V = ${V.toFixed(1)} V`,
        95,
        320
      );

      result.innerHTML =
        `Ohm's Law: V = IR<br>` +
        `Current I = ${I.toFixed(3)} A<br>` +
        `Voltage V = ${V.toFixed(2)} V<br>` +
        `Resistance R = ${R.toFixed(2)} Ω`;
    }


    // ========================================================
    // HOOKE'S LAW
    // ========================================================

    function hooke() {

      clear();

      const F =
        clamp(
          num(
            state.force,
            5
          ),
          0,
          50
        );

      const k =
        clamp(
          num(
            state.springConstant,
            50
          ),
          1,
          200
        );

      const x =
        F / k;

      // ------------------------------------------------------
      // Support
      // ------------------------------------------------------

      ctx.fillStyle =
        "#555";

      ctx.fillRect(
        100,
        45,
        40,
        270
      );

      ctx.fillStyle =
        "#222";

      // ------------------------------------------------------
      // Spring
      // ------------------------------------------------------

      const startX =
        140;

      const endX =
        430 +
        Math.min(
          x * 450,
          170
        );

      const coils =
        12;

      const width =
        endX -
        startX;

      ctx.strokeStyle =
        "#333";

      ctx.lineWidth =
        3;

      ctx.beginPath();

      ctx.moveTo(
        startX,
        150
      );

      for (
        let i = 0;
        i < coils;
        i++
      ) {

        const px =
          startX +
          (
            width *
            i /
            coils
          );

        const next =
          startX +
          (
            width *
            (i + .5) /
            coils
          );

        const final =
          startX +
          (
            width *
            (i + 1) /
            coils
          );

        ctx.lineTo(
          next,
          i % 2 === 0
            ? 125
            : 175
        );

        ctx.lineTo(
          final,
          150
        );
      }

      ctx.stroke();

      // ------------------------------------------------------
      // Mass / force block
      // ------------------------------------------------------

      ctx.fillStyle =
        "#777";

      ctx.fillRect(
        endX,
        125,
        65,
        50
      );

      ctx.fillStyle =
        "#222";

      ctx.font =
        "bold 16px Arial";

      ctx.fillText(
        `F = ${F.toFixed(1)} N`,
        endX - 5,
        205
      );

      ctx.fillText(
        `x = ${x.toFixed(3)} m`,
        endX - 5,
        230
      );

      ctx.font =
        "16px Arial";

      ctx.fillText(
        `k = ${k.toFixed(1)} N/m`,
        250,
        300
      );

      result.innerHTML =
        `Hooke's Law: F = kx<br>` +
        `Extension x = ${x.toFixed(4)} m<br>` +
        `Force F = ${F.toFixed(2)} N<br>` +
        `Spring constant k = ${k.toFixed(2)} N/m`;
    }


    // ========================================================
    // UNIFORM ACCELERATION
    // ========================================================

    function uniformAcceleration() {

      clear();

      const u =
        num(
          state.u,
          5
        );

      const a =
        num(
          state.acceleration,
          2
        );

      const time =
        clamp(
          num(
            state.time,
            5
          ),
          0,
          20
        );

      const v =
        u +
        a * time;

      const s =
        u * time +
        .5 *
        a *
        time *
        time;

      // ------------------------------------------------------
      // Ground
      // ------------------------------------------------------

      ctx.strokeStyle =
        "#333";

      ctx.lineWidth =
        2;

      ctx.beginPath();

      ctx.moveTo(
        55,
        270
      );

      ctx.lineTo(
        700,
        270
      );

      ctx.stroke();

      // ------------------------------------------------------
      // Motion object
      // ------------------------------------------------------

      const position =
        90 +
        (
          Math.abs(s) %
          540
        );

      ctx.fillStyle =
        "#555";

      ctx.beginPath();

      ctx.arc(
        position,
        240,
        18,
        0,
        Math.PI * 2
      );

      ctx.fill();

      // ------------------------------------------------------
      // Velocity vector
      // ------------------------------------------------------

      const direction =
        v >= 0
          ? 1
          : -1;

      const arrowLength =
        clamp(
          Math.abs(v) * 5,
          25,
          170
        );

      ctx.strokeStyle =
        "#333";

      ctx.lineWidth =
        3;

      ctx.beginPath();

      ctx.moveTo(
        position,
        200
      );

      ctx.lineTo(
        position +
          direction *
          arrowLength,
        200
      );

      ctx.lineTo(
        position +
          direction *
          (
            arrowLength -
            15
          ),
        190
      );

      ctx.moveTo(
        position +
          direction *
          arrowLength,
        200
      );

      ctx.lineTo(
        position +
          direction *
          (
            arrowLength -
            15
          ),
        210
      );

      ctx.stroke();

      ctx.font =
        "16px Arial";

      ctx.fillText(
        `v = ${v.toFixed(2)} m/s`,
        70,
        70
      );

      ctx.fillText(
        `u = ${u.toFixed(2)} m/s`,
        70,
        95
      );

      ctx.fillText(
        `a = ${a.toFixed(2)} m/s²`,
        70,
        120
      );

      ctx.fillText(
        `t = ${time.toFixed(2)} s`,
        70,
        145
      );

      result.innerHTML =
        `Final velocity v = ${v.toFixed(3)} m/s<br>` +
        `Displacement s = ${s.toFixed(3)} m<br>` +
        `Using v = u + at and s = ut + ½at²`;
    }


    // ========================================================
    // SIMPLE PENDULUM
    // ========================================================

    function pendulum() {

      clear();

      const L =
        clamp(
          num(
            state.length,
            1
          ),
          .1,
          5
        );

      const g =
        clamp(
          num(
            state.gravity,
            9.81
          ),
          .1,
          30
        );

      const T =
        2 *
        Math.PI *
        Math.sqrt(
          L / g
        );

      const f =
        1 / T;

      // ------------------------------------------------------
      // Ceiling
      // ------------------------------------------------------

      ctx.fillStyle =
        "#555";

      ctx.fillRect(
        130,
        45,
        500,
        18
      );

      // ------------------------------------------------------
      // Pendulum geometry
      // ------------------------------------------------------

      const pivotX =
        380;

      const pivotY =
        63;

      const lengthPx =
        clamp(
          L * 70,
          60,
          270
        );

      const angle =
        28 *
        Math.PI /
        180;

      const bobX =
        pivotX +
        Math.sin(
          angle
        ) *
        lengthPx;

      const bobY =
        pivotY +
        Math.cos(
          angle
        ) *
        lengthPx;

      ctx.strokeStyle =
        "#333";

      ctx.lineWidth =
        3;

      ctx.beginPath();

      ctx.moveTo(
        pivotX,
        pivotY
      );

      ctx.lineTo(
        bobX,
        bobY
      );

      ctx.stroke();

      // ------------------------------------------------------
      // Pivot
      // ------------------------------------------------------

      ctx.fillStyle =
        "#333";

      ctx.beginPath();

      ctx.arc(
        pivotX,
        pivotY,
        6,
        0,
        Math.PI * 2
      );

      ctx.fill();

      // ------------------------------------------------------
      // Bob
      // ------------------------------------------------------

      ctx.fillStyle =
        "#777";

      ctx.beginPath();

      ctx.arc(
        bobX,
        bobY,
        24,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillStyle =
        "#222";

      ctx.font =
        "16px Arial";

      ctx.fillText(
        `L = ${L.toFixed(2)} m`,
        420,
        170
      );

      ctx.fillText(
        `g = ${g.toFixed(2)} m/s²`,
        420,
        195
      );

      ctx.fillText(
        `T = ${T.toFixed(3)} s`,
        420,
        220
      );

      result.innerHTML =
        `Period T = ${T.toFixed(3)} s<br>` +
        `Frequency f = ${f.toFixed(3)} Hz<br>` +
        `Using T = 2π√(L/g)`;
    }

       // ==========================================================
    // SERIES & PARALLEL CIRCUIT
    // ==========================================================

    function circuit() {

      clear();

      const V =
        clamp(
          num(
            state.voltage,
            12
          ),
          1,
          50
        );

      const R1 =
        clamp(
          num(
            state.resistance1,
            4
          ),
          1,
          100
        );

      const R2 =
        clamp(
          num(
            state.resistance2,
            6
          ),
          1,
          100
        );

      const seriesR =
        R1 + R2;

      const parallelR =
        1 /
        (
          (1 / R1) +
          (1 / R2)
        );

      const seriesI =
        V / seriesR;

      const parallelI =
        V / parallelR;

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.font =
        "bold 20px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "Series and Parallel Circuit",
        W / 2,
        30
      );

      ctx.font =
        "15px Arial";

      // --------------------------------------------------------
      // SERIES CIRCUIT
      // --------------------------------------------------------

      ctx.strokeStyle =
        "#222";

      ctx.lineWidth =
        3;

      ctx.beginPath();

      ctx.moveTo(
        70,
        90
      );

      ctx.lineTo(
        160,
        90
      );

      ctx.lineTo(
        160,
        60
      );

      ctx.lineTo(
        220,
        60
      );

      ctx.lineTo(
        220,
        90
      );

      ctx.lineTo(
        330,
        90
      );

      ctx.lineTo(
        330,
        120
      );

      ctx.lineTo(
        220,
        120
      );

      ctx.lineTo(
        220,
        150
      );

      ctx.lineTo(
        160,
        150
      );

      ctx.lineTo(
        160,
        120
      );

      ctx.lineTo(
        70,
        120
      );

      ctx.closePath();

      ctx.stroke();

      // Battery

      ctx.beginPath();

      ctx.moveTo(
        110,
        80
      );

      ctx.lineTo(
        110,
        130
      );

      ctx.moveTo(
        125,
        90
      );

      ctx.lineTo(
        125,
        120
      );

      ctx.stroke();

      ctx.fillText(
        `${V.toFixed(1)} V`,
        118,
        155
      );

      // Resistors

      function drawResistor(
        x,
        y,
        label
      ) {

        ctx.beginPath();

        ctx.moveTo(
          x - 35,
          y
        );

        for (
          let i = 0;
          i < 6;
          i++
        ) {

          ctx.lineTo(
            x - 35 +
            i * 14,
            y +
            (
              i % 2 === 0
                ? -10
                : 10
            )
          );
        }

        ctx.lineTo(
          x + 35,
          y
        );

        ctx.stroke();

        ctx.fillText(
          label,
          x,
          y - 18
        );
      }

      drawResistor(
        200,
        60,
        `R₁ = ${R1.toFixed(1)} Ω`
      );

      drawResistor(
        275,
        120,
        `R₂ = ${R2.toFixed(1)} Ω`
      );

      ctx.fillText(
        `Series R = ${seriesR.toFixed(2)} Ω`,
        W / 2,
        190
      );

      ctx.fillText(
        `Series I = ${seriesI.toFixed(3)} A`,
        W / 2,
        212
      );

      // --------------------------------------------------------
      // PARALLEL CIRCUIT
      // --------------------------------------------------------

      const top =
        270;

      ctx.beginPath();

      ctx.moveTo(
        80,
        top
      );

      ctx.lineTo(
        180,
        top
      );

      ctx.lineTo(
        180,
        top - 40
      );

      ctx.lineTo(
        350,
        top - 40
      );

      ctx.lineTo(
        350,
        top
      );

      ctx.lineTo(
        430,
        top
      );

      ctx.moveTo(
        180,
        top
      );

      ctx.lineTo(
        180,
        top + 100
      );

      ctx.lineTo(
        350,
        top + 100
      );

      ctx.lineTo(
        350,
        top
      );

      ctx.stroke();

      // Battery

      ctx.beginPath();

      ctx.moveTo(
        115,
        top - 25
      );

      ctx.lineTo(
        115,
        top + 25
      );

      ctx.moveTo(
        130,
        top - 15
      );

      ctx.lineTo(
        130,
        top + 15
      );

      ctx.stroke();

      ctx.fillText(
        `${V.toFixed(1)} V`,
        123,
        top + 55
      );

      drawResistor(
        265,
        top - 40,
        `R₁ = ${R1.toFixed(1)} Ω`
      );

      drawResistor(
        265,
        top + 100,
        `R₂ = ${R2.toFixed(1)} Ω`
      );

      ctx.fillText(
        `Parallel R = ${parallelR.toFixed(2)} Ω`,
        W / 2,
        410
      );

      ctx.fillText(
        `Total parallel I = ${parallelI.toFixed(3)} A`,
        W / 2,
        432
      );

      ctx.textAlign =
        "left";

      ctx.fillText(
        "Key idea: series resistances add; parallel resistance decreases.",
        25,
        H - 20
      );
    }


    // ==========================================================
    // WAVE MOTION
    // ==========================================================

    function wave() {

      clear();

      const A =
        clamp(
          num(
            state.amplitude,
            1
          ),
          0.1,
          10
        );

      const f =
        clamp(
          num(
            state.frequency,
            2
          ),
          0.1,
          10
        );

      const wavelength =
        clamp(
          num(
            state.wavelength,
            2
          ),
          0.1,
          10
        );

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Wave Motion",
        W / 2,
        30
      );

      ctx.font =
        "14px Arial";

      const mid =
        H / 2;

      const scale =
        Math.min(
          22,
          70 / wavelength
        );

      ctx.beginPath();

      for (
        let x = 20;
        x <= W - 20;
        x++
      ) {

        const y =
          mid -
          A *
          scale *
          Math.sin(
            (
              2 *
              Math.PI *
              x /
              (wavelength * 80)
            )
          );

        if (
          x === 20
        ) {
          ctx.moveTo(
            x,
            y
          );
        } else {
          ctx.lineTo(
            x,
            y
          );
        }
      }

      ctx.stroke();

      // Equilibrium line

      ctx.setLineDash(
        [6, 5]
      );

      ctx.beginPath();

      ctx.moveTo(
        20,
        mid
      );

      ctx.lineTo(
        W - 20,
        mid
      );

      ctx.stroke();

      ctx.setLineDash([]);

      // Amplitude marker

      ctx.beginPath();

      ctx.moveTo(
        60,
        mid
      );

      ctx.lineTo(
        60,
        mid - A * scale
      );

      ctx.stroke();

      ctx.fillText(
        `Amplitude A = ${A.toFixed(2)}`,
        110,
        mid - A * scale / 2
      );

      // Wavelength marker

      const lambdaY =
        H - 55;

      ctx.beginPath();

      ctx.moveTo(
        80,
        lambdaY
      );

      ctx.lineTo(
        160,
        lambdaY
      );

      ctx.stroke();

      ctx.fillText(
        `λ = ${wavelength.toFixed(2)}`,
        120,
        lambdaY - 8
      );

      ctx.fillText(
        `Frequency f = ${f.toFixed(2)} Hz`,
        W / 2,
        H - 25
      );

      ctx.textAlign =
        "left";

      ctx.fillText(
        "Wave relation: v = fλ",
        20,
        55
      );
    }


    // ==========================================================
    // LENS FORMULA
    // ==========================================================

    function lens() {

      clear();

      const f =
        clamp(
          num(
            state.focalLength,
            20
          ),
          1,
          100
        );

      const u =
        clamp(
          num(
            state.objectDistance,
            50
          ),
          1,
          200
        );

      const W =
        canvas.width;

      const H =
        canvas.height;

      const denominator =
        (
          1 / f
        ) -
        (
          1 / u
        );

      const v =
        Math.abs(
          denominator
        ) > 1e-9
          ? 1 / denominator
          : Infinity;

      const magnification =
        Number.isFinite(v)
          ? v / u
          : Infinity;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Thin Lens Explorer",
        W / 2,
        30
      );

      // Principal axis

      const axisY =
        H / 2;

      ctx.beginPath();

      ctx.moveTo(
        20,
        axisY
      );

      ctx.lineTo(
        W - 20,
        axisY
      );

      ctx.stroke();

      // Lens

      const lensX =
        W / 2;

      ctx.beginPath();

      ctx.ellipse(
        lensX,
        axisY,
        12,
        110,
        0,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      ctx.fillText(
        "Convex lens",
        lensX,
        axisY - 125
      );

      // Focal points

      const focalScale =
        2.2;

      const F =
        Math.min(
          150,
          f * focalScale
        );

      ctx.beginPath();

      ctx.arc(
        lensX - F,
        axisY,
        4,
        0,
        Math.PI * 2
      );

      ctx.arc(
        lensX + F,
        axisY,
        4,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillText(
        "F",
        lensX - F,
        axisY + 20
      );

      ctx.fillText(
        "F",
        lensX + F,
        axisY + 20
      );

      // Object

      const objectX =
        Math.max(
          35,
          lensX -
          Math.min(
            260,
            u * 2.2
          )
        );

      ctx.beginPath();

      ctx.moveTo(
        objectX,
        axisY
      );

      ctx.lineTo(
        objectX,
        axisY - 70
      );

      ctx.moveTo(
        objectX,
        axisY - 70
      );

      ctx.lineTo(
        objectX - 8,
        axisY - 55
      );

      ctx.moveTo(
        objectX,
        axisY - 70
      );

      ctx.lineTo(
        objectX + 8,
        axisY - 55
      );

      ctx.stroke();

      ctx.fillText(
        "Object",
        objectX,
        axisY + 25
      );

      // Image

      if (
        Number.isFinite(v)
      ) {

        const imageX =
          Math.min(
            W - 40,
            lensX +
            Math.min(
              260,
              Math.abs(v) * 2.2
            )
          );

        const imageHeight =
          Math.min(
            120,
            70 *
            Math.abs(
              magnification
            )
          );

        ctx.beginPath();

        ctx.moveTo(
          imageX,
          axisY
        );

        ctx.lineTo(
          imageX,
          axisY -
          imageHeight
        );

        ctx.stroke();

        ctx.fillText(
          v > 0
            ? "Real image"
            : "Virtual image",
          imageX,
          axisY + 25
        );
      }

      ctx.textAlign =
        "left";

      ctx.fillText(
        `f = ${f.toFixed(2)} cm`,
        20,
        H - 70
      );

      ctx.fillText(
        `u = ${u.toFixed(2)} cm`,
        20,
        H - 48
      );

      ctx.fillText(
        Number.isFinite(v)
          ? `v = ${v.toFixed(2)} cm`
          : "v = ∞",
        20,
        H - 26
      );

      ctx.textAlign =
        "center";

      ctx.fillText(
        Number.isFinite(
          magnification
        )
          ? `Magnification = ${magnification.toFixed(3)}`
          : "Magnification = undefined",
        W - 150,
        H - 30
      );
    }


    // ==========================================================
    // TRANSFORMER
    // ==========================================================

    function transformer() {

      clear();

      const Vp =
        clamp(
          num(
            state.primaryVoltage,
            240
          ),
          1,
          1000
        );

      const Np =
        clamp(
          num(
            state.primaryTurns,
            500
          ),
          1,
          10000
        );

      const Ns =
        clamp(
          num(
            state.secondaryTurns,
            1000
          ),
          1,
          10000
        );

      const Vs =
        Vp *
        (
          Ns / Np
        );

      const ratio =
        Ns / Np;

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Transformer Explorer",
        W / 2,
        30
      );

      // --------------------------------------------------------
      // IRON CORE
      // --------------------------------------------------------

      ctx.lineWidth =
        8;

      ctx.strokeRect(
        W / 2 - 150,
        80,
        300,
        230
      );

      ctx.lineWidth =
        3;

      // --------------------------------------------------------
      // PRIMARY COIL
      // --------------------------------------------------------

      const primaryX =
        W / 2 - 80;

      const secondaryX =
        W / 2 + 80;

      ctx.beginPath();

      for (
        let i = 0;
        i < 8;
        i++
      ) {

        ctx.ellipse(
          primaryX,
          110 + i * 25,
          45,
          12,
          0,
          0,
          Math.PI * 2
        );
      }

      ctx.stroke();

      // --------------------------------------------------------
      // SECONDARY COIL
      // --------------------------------------------------------

      ctx.beginPath();

      for (
        let i = 0;
        i < 8;
        i++
      ) {

        ctx.ellipse(
          secondaryX,
          110 + i * 25,
          45,
          12,
          0,
          0,
          Math.PI * 2
        );
      }

      ctx.stroke();

      ctx.font =
        "15px Arial";

      ctx.fillText(
        "Primary coil",
        primaryX,
        330
      );

      ctx.fillText(
        "Secondary coil",
        secondaryX,
        330
      );

      // --------------------------------------------------------
      // INPUT / OUTPUT
      // --------------------------------------------------------

      ctx.fillText(
        `Vp = ${Vp.toFixed(1)} V`,
        primaryX,
        355
      );

      ctx.fillText(
        `Vs = ${Vs.toFixed(1)} V`,
        secondaryX,
        355
      );

      ctx.fillText(
        `Np = ${Np}`,
        primaryX,
        378
      );

      ctx.fillText(
        `Ns = ${Ns}`,
        secondaryX,
        378
      );

      // --------------------------------------------------------
      // TRANSFORMER TYPE
      // --------------------------------------------------------

      let transformerType;

      if (
        ratio > 1
      ) {
        transformerType =
          "Step-up transformer";
      } else if (
        ratio < 1
      ) {
        transformerType =
          "Step-down transformer";
      } else {
        transformerType =
          "Isolation transformer";
      }

      ctx.font =
        "bold 16px Arial";

      ctx.fillText(
        transformerType,
        W / 2,
        420
      );

      ctx.font =
        "14px Arial";

      ctx.fillText(
        `Turns ratio Ns/Np = ${ratio.toFixed(3)}`,
        W / 2,
        445
      );

      ctx.fillText(
        "Relationship: Vs/Vp = Ns/Np",
        W / 2,
        468
      );
    }

       // ==========================================================
    // DENSITY / PRESSURE
    // ==========================================================

    function densityPressure() {

      clear();

      const rho =
        clamp(
          num(
            state.density,
            1000
          ),
          0.1,
          20000
        );

      const h =
        clamp(
          num(
            state.depth,
            2
          ),
          0,
          100
        );

      const g =
        clamp(
          num(
            state.gravity,
            9.81
          ),
          0.1,
          30
        );

      const p =
        rho *
        g *
        h;

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Fluid Pressure Explorer",
        W / 2,
        30
      );

      // --------------------------------------------------------
      // CONTAINER
      // --------------------------------------------------------

      const tankX =
        250;

      const tankY =
        60;

      const tankW =
        220;

      const tankH =
        260;

      ctx.strokeRect(
        tankX,
        tankY,
        tankW,
        tankH
      );

      // --------------------------------------------------------
      // FLUID
      // --------------------------------------------------------

      const fluidHeight =
        Math.min(
          tankH - 10,
          Math.max(
            20,
            h * 2.3
          )
        );

      ctx.fillRect(
        tankX + 5,
        tankY +
          tankH -
          fluidHeight -
          5,
        tankW - 10,
        fluidHeight
      );

      ctx.font =
        "15px Arial";

      ctx.fillText(
        "Liquid",
        tankX +
          tankW / 2,
        tankY +
          tankH / 2
      );

      // --------------------------------------------------------
      // DEPTH MARKER
      // --------------------------------------------------------

      const bottomY =
        tankY +
        tankH -
        10;

      const topY =
        bottomY -
        fluidHeight;

      ctx.beginPath();

      ctx.moveTo(
        tankX - 35,
        topY
      );

      ctx.lineTo(
        tankX - 35,
        bottomY
      );

      ctx.moveTo(
        tankX - 42,
        topY
      );

      ctx.lineTo(
        tankX - 28,
        topY
      );

      ctx.moveTo(
        tankX - 42,
        bottomY
      );

      ctx.lineTo(
        tankX - 28,
        bottomY
      );

      ctx.stroke();

      ctx.fillText(
        `h = ${h.toFixed(2)} m`,
        tankX - 85,
        (
          topY +
          bottomY
        ) / 2
      );

      // --------------------------------------------------------
      // PRESSURE AT DEPTH
      // --------------------------------------------------------

      ctx.beginPath();

      ctx.arc(
        tankX +
          tankW / 2,
        bottomY - 5,
        7,
        0,
        Math.PI * 2
      );

      ctx.fill();

      ctx.fillText(
        "Pressure point",
        tankX +
          tankW / 2,
        bottomY + 28
      );

      // --------------------------------------------------------
      // RESULTS
      // --------------------------------------------------------

      ctx.textAlign =
        "left";

      ctx.fillText(
        `Density ρ = ${rho.toFixed(2)} kg/m³`,
        25,
        H - 72
      );

      ctx.fillText(
        `Gravity g = ${g.toFixed(2)} m/s²`,
        25,
        H - 48
      );

      ctx.fillText(
        `Pressure p = ρgh = ${p.toFixed(2)} Pa`,
        25,
        H - 24
      );

      ctx.textAlign =
        "center";
    }


    // ==========================================================
    // GAS LAW
    // ==========================================================

    function gasLaw() {

      clear();

      const P =
        clamp(
          num(
            state.pressure,
            100
          ),
          1,
          1000
        );

      const V =
        clamp(
          num(
            state.volume,
            1
          ),
          0.1,
          20
        );

      const T =
        clamp(
          num(
            state.temperature,
            300
          ),
          1,
          2000
        );

      const constant =
        (
          P * V
        ) / T;

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Gas Law Explorer",
        W / 2,
        30
      );

      // --------------------------------------------------------
      // GAS CHAMBER
      // --------------------------------------------------------

      const chamberX =
        180;

      const chamberY =
        65;

      const chamberW =
        360;

      const chamberH =
        250;

      ctx.strokeRect(
        chamberX,
        chamberY,
        chamberW,
        chamberH
      );

      // --------------------------------------------------------
      // PISTON
      // --------------------------------------------------------

      const pistonHeight =
        18;

      const pistonY =
        chamberY +
        chamberH -
        Math.min(
          chamberH - 40,
          Math.max(
            25,
            V * 10
          )
        );

      ctx.fillRect(
        chamberX + 10,
        pistonY,
        chamberW - 20,
        pistonHeight
      );

      ctx.fillText(
        "Movable piston",
        W / 2,
        pistonY - 12
      );

      // --------------------------------------------------------
      // GAS PARTICLES
      // --------------------------------------------------------

      const particleCount =
        Math.min(
          35,
          Math.max(
            8,
            Math.round(
              P / 30
            )
          )
        );

      for (
        let i = 0;
        i < particleCount;
        i++
      ) {

        const px =
          chamberX +
          25 +
          (
            i * 47
          ) %
          (
            chamberW - 50
          );

        const py =
          chamberY +
          30 +
          (
            i * 71
          ) %
          Math.max(
            30,
            pistonY -
            chamberY -
            45
          );

        ctx.beginPath();

        ctx.arc(
          px,
          py,
          4,
          0,
          Math.PI * 2
        );

        ctx.fill();
      }

      // --------------------------------------------------------
      // RESULTS
      // --------------------------------------------------------

      ctx.font =
        "15px Arial";

      ctx.fillText(
        `Pressure P = ${P.toFixed(2)}`,
        W / 2,
        355
      );

      ctx.fillText(
        `Volume V = ${V.toFixed(2)}`,
        W / 2,
        378
      );

      ctx.fillText(
        `Temperature T = ${T.toFixed(2)} K`,
        W / 2,
        401
      );

      ctx.font =
        "bold 16px Arial";

      ctx.fillText(
        `PV/T = ${constant.toFixed(4)}`,
        W / 2,
        430
      );

      ctx.font =
        "14px Arial";

      ctx.fillText(
        "Ideal-gas relationship: PV/T = constant",
        W / 2,
        455
      );

      ctx.textAlign =
        "left";

      ctx.fillText(
        "Explore how pressure, volume and temperature are related.",
        20,
        H - 20
      );
    }


    // ==========================================================
    // PROBABILITY
    // ==========================================================

    function probability() {

      clear();

      const favourable =
        clamp(
          num(
            state.favourable,
            1
          ),
          0,
          100
        );

      const total =
        clamp(
          num(
            state.total,
            6
          ),
          1,
          100
        );

      const probabilityValue =
        Math.min(
          favourable / total,
          1
        );

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Probability Explorer",
        W / 2,
        30
      );

      // --------------------------------------------------------
      // PROBABILITY BAR
      // --------------------------------------------------------

      const barX =
        100;

      const barY =
        120;

      const barW =
        500;

      const barH =
        70;

      ctx.strokeRect(
        barX,
        barY,
        barW,
        barH
      );

      ctx.fillRect(
        barX,
        barY,
        barW *
          probabilityValue,
        barH
      );

      // --------------------------------------------------------
      // SCALE
      // --------------------------------------------------------

      ctx.font =
        "13px Arial";

      for (
        let i = 0;
        i <= 10;
        i++
      ) {

        const x =
          barX +
          (
            barW *
            i /
            10
          );

        ctx.beginPath();

        ctx.moveTo(
          x,
          barY +
          barH
        );

        ctx.lineTo(
          x,
          barY +
          barH +
          8
        );

        ctx.stroke();

        ctx.fillText(
          `${i / 10}`,
          x,
          barY +
          barH +
          25
        );
      }

      // --------------------------------------------------------
      // FORMULA
      // --------------------------------------------------------

      ctx.font =
        "16px Arial";

      ctx.fillText(
        `Favourable outcomes = ${favourable.toFixed(0)}`,
        W / 2,
        210
      );

      ctx.fillText(
        `Total outcomes = ${total.toFixed(0)}`,
        W / 2,
        235
      );

      ctx.font =
        "bold 18px Arial";

      ctx.fillText(
        `P(E) = favourable / total`,
        W / 2,
        275
      );

      ctx.fillText(
        `P(E) = ${probabilityValue.toFixed(4)}`,
        W / 2,
        305
      );

      ctx.fillText(
        `${(
          probabilityValue *
          100
        ).toFixed(2)}%`,
        W / 2,
        335
      );

      ctx.font =
        "14px Arial";

      ctx.fillText(
        "Probability ranges from 0 (impossible) to 1 (certain).",
        W / 2,
        H - 25
      );
    }


    // ==========================================================
    // ELECTROMAGNETIC INDUCTION
    // ==========================================================

    function electromagneticInduction() {

      clear();

      const turns =
        clamp(
          num(
            state.turns,
            50
          ),
          1,
          500
        );

      const velocity =
        clamp(
          num(
            state.velocity,
            2
          ),
          0,
          20
        );

      const magneticField =
        clamp(
          num(
            state.magneticField,
            0.5
          ),
          0,
          5
        );

      /*
       * Simplified Faraday's law demonstration:
       *
       * ε ∝ N × B × v
       *
       * The negative sign represents Lenz's law.
       */

      const emf =
        turns *
        magneticField *
        velocity *
        0.1;

      const W =
        canvas.width;

      const H =
        canvas.height;

      ctx.textAlign =
        "center";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "Electromagnetic Induction",
        W / 2,
        30
      );

      // --------------------------------------------------------
      // MAGNETIC FIELD LINES
      // --------------------------------------------------------

      ctx.strokeStyle =
        "#555";

      ctx.lineWidth =
        1;

      for (
        let i = 0;
        i < 5;
        i++
      ) {

        ctx.beginPath();

        ctx.arc(
          170,
          175,
          35 +
          i * 12,
          0,
          Math.PI * 2
        );

        ctx.stroke();
      }

      // --------------------------------------------------------
      // BAR MAGNET
      // --------------------------------------------------------

      ctx.fillStyle =
        "#777";

      ctx.fillRect(
        115,
        145,
        55,
        60
      );

      ctx.fillStyle =
        "#fff";

      ctx.font =
        "bold 20px Arial";

      ctx.fillText(
        "N",
        142,
        181
      );

      // --------------------------------------------------------
      // COIL
      // --------------------------------------------------------

      ctx.strokeStyle =
        "#222";

      ctx.lineWidth =
        2;

      for (
        let i = 0;
        i < 7;
        i++
      ) {

        ctx.beginPath();

        ctx.ellipse(
          420 +
          i * 8,
          175,
          18,
          55,
          0,
          0,
          Math.PI * 2
        );

        ctx.stroke();
      }

      // --------------------------------------------------------
      // CONNECTING WIRES
      // --------------------------------------------------------

      ctx.beginPath();

      ctx.moveTo(
        420,
        120
      );

      ctx.lineTo(
        420,
        80
      );

      ctx.lineTo(
        600,
        80
      );

      ctx.lineTo(
        600,
        140
      );

      ctx.stroke();

      ctx.beginPath();

      ctx.moveTo(
        476,
        230
      );

      ctx.lineTo(
        476,
        280
      );

      ctx.lineTo(
        600,
        280
      );

      ctx.lineTo(
        600,
        210
      );

      ctx.stroke();

      // --------------------------------------------------------
      // GALVANOMETER
      // --------------------------------------------------------

      ctx.beginPath();

      ctx.arc(
        600,
        175,
        35,
        0,
        Math.PI * 2
      );

      ctx.stroke();

      ctx.font =
        "bold 16px Arial";

      ctx.fillText(
        "G",
        600,
        181
      );

      // --------------------------------------------------------
      // MOTION ARROW
      // --------------------------------------------------------

      ctx.beginPath();

      ctx.moveTo(
        190,
        175
      );

      ctx.lineTo(
        280,
        175
      );

      ctx.lineTo(
        265,
        165
      );

      ctx.moveTo(
        280,
        175
      );

      ctx.lineTo(
        265,
        185
      );

      ctx.stroke();

      ctx.font =
        "14px Arial";

      ctx.fillText(
        "Motion",
        235,
        155
      );

      // --------------------------------------------------------
      // LABELS
      // --------------------------------------------------------

      ctx.fillText(
        "Bar magnet",
        142,
        225
      );

      ctx.fillText(
        "Coil / solenoid",
        450,
        315
      );

      ctx.fillText(
        "Galvanometer",
        600,
        230
      );

      // --------------------------------------------------------
      // RESULTS
      // --------------------------------------------------------

      ctx.font =
        "14px Arial";

      ctx.fillText(
        `N = ${turns} turns`,
        W / 2,
        355
      );

      ctx.fillText(
        `B = ${magneticField.toFixed(2)} T`,
        W / 2,
        378
      );

      ctx.fillText(
        `v = ${velocity.toFixed(2)} m/s`,
        W / 2,
        401
      );

      ctx.font =
        "bold 16px Arial";

      ctx.fillText(
        `Induced e.m.f. ≈ ${emf.toFixed(2)} units`,
        W / 2,
        430
      );

      ctx.font =
        "14px Arial";

      ctx.fillText(
        "Faraday's Law: ε = −N dΦ/dt",
        W / 2,
        455
      );

      ctx.fillText(
        "Lenz's Law: the induced effect opposes the change producing it.",
        W / 2,
        480
      );

      ctx.textAlign =
        "left";
    }

       // ========================================================
    // ELECTROLYSIS MODEL
    //
    // PhET-inspired separation:
    // MODEL = state + scientific relationships
    // VIEW  = drawing and presentation
    // CONTROLS = existing trusted sliders
    // ========================================================

    function createElectrolysisModel() {

      const model = {

        // Faraday constant
        F: 96485,

        // State
        current: 2,
        time: 600,
        molarMass: 63.5,
        valency: 2,

        setState(values) {

          this.current =
            clamp(
              num(values.current, 2),
              0,
              20
            );

          this.time =
            clamp(
              num(values.time, 600),
              1,
              7200
            );

          this.molarMass =
            clamp(
              num(values.molarMass, 63.5),
              1,
              300
            );

          this.valency =
            clamp(
              num(values.valency, 2),
              1,
              6
            );
        },

        calculate() {

          const Q =
            this.current *
            this.time;

          const moles =
            Q /
            (
              this.valency *
              this.F
            );

          const mass =
            moles *
            this.molarMass;

          return {
            current: this.current,
            time: this.time,
            molarMass: this.molarMass,
            valency: this.valency,
            faradayConstant: this.F,
            charge: Q,
            molesDeposited: moles,
            massDeposited: mass
          };
        }
      };

      return model;
    }


    // One persistent model instance.
    // Controls modify state; the view reads calculated results.
    const electrolysisModel =
      createElectrolysisModel();


    // ========================================================
    // ELECTROLYSIS VIEW
    //
    // VIEW = polished interactive canvas representation.
    // MODEL remains responsible for all calculations.
    // ========================================================

    function electrolysis() {

      // Synchronise model with current control state.
      electrolysisModel.setState(state);

      const values =
        electrolysisModel.calculate();

      const I = values.current;
      const t = values.time;
      const M = values.molarMass;
      const n = values.valency;
      const F = values.faradayConstant;
      const Q = values.charge;
      const moles = values.molesDeposited;
      const mass = values.massDeposited;

      clear();

      // ------------------------------------------------------
      // Polished Electrolysis Learning Simulation
      // ------------------------------------------------------

      const W = canvas.width;
      const H = canvas.height;
      const now = Date.now();
      const motion = now / 900;

      // Background
      const bg =
        ctx.createLinearGradient(0, 0, W, H);

      bg.addColorStop(
        0,
        "#f7fbff"
      );

      bg.addColorStop(
        1,
        "#eef8f5"
      );

      ctx.fillStyle = bg;

      ctx.fillRect(
        0,
        0,
        W,
        H
      );


      // ------------------------------------------------------
      // HEADER
      // ------------------------------------------------------

      ctx.textAlign =
        "left";

      ctx.fillStyle =
        "#17382b";

      ctx.font =
        "bold 22px Arial";

      ctx.fillText(
        "Electrolysis Explorer",
        24,
        31
      );

      ctx.fillStyle =
        "#66746d";

      ctx.font =
        "13px Arial";

      ctx.fillText(
        "Watch ions migrate and see how charge affects deposition.",
        24,
        51
      );


      // ------------------------------------------------------
      // POWER SUPPLY
      // ------------------------------------------------------

      const batteryX =
        42;

      const batteryY =
        75;

      const batteryW =
        125;

      const batteryH =
        62;

      const batteryGrad =
        ctx.createLinearGradient(
          batteryX,
          batteryY,
          batteryX,
          batteryY + batteryH
        );

      batteryGrad.addColorStop(
        0,
        "#ffffff"
      );

      batteryGrad.addColorStop(
        1,
        "#e8eef5"
      );

      ctx.fillStyle =
        batteryGrad;

      ctx.strokeStyle =
        "#52606d";

      ctx.lineWidth =
        2;

      ctx.beginPath();

      ctx.roundRect(
        batteryX,
        batteryY,
        batteryW,
        batteryH,
        12
      );

      ctx.fill();

      ctx.stroke();

      ctx.fillStyle =
        "#334155";

      ctx.font =
        "bold 14px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "DC POWER SUPPLY",
        batteryX +
          batteryW / 2,
        batteryY + 24
      );

      ctx.font =
        "bold 20px Arial";

      ctx.fillStyle =
        "#c0392b";

      ctx.fillText(
        "+",
        batteryX + 28,
        batteryY + 49
      );

      ctx.fillStyle =
        "#2563a8";

      ctx.fillText(
        "−",
        batteryX +
          batteryW -
          28,
        batteryY + 49
      );


      // ------------------------------------------------------
      // MAIN ELECTROLYTIC CELL
      // ------------------------------------------------------

      const vessel = {
        x: 215,
        y: 83,
        w: 500,
        h: 235
      };


      // Glass vessel

      ctx.fillStyle =
        "rgba(255,255,255,.72)";

      ctx.strokeStyle =
        "#536b70";

      ctx.lineWidth =
        3;

      ctx.beginPath();

      ctx.roundRect(
        vessel.x,
        vessel.y,
        vessel.w,
        vessel.h,
        18
      );

      ctx.fill();

      ctx.stroke();


      // ------------------------------------------------------
      // ELECTROLYTE LIQUID
      // ------------------------------------------------------

      const liquidGrad =
        ctx.createLinearGradient(
          0,
          vessel.y + 70,
          0,
          vessel.y + vessel.h
        );

      liquidGrad.addColorStop(
        0,
        "rgba(65,190,175,.30)"
      );

      liquidGrad.addColorStop(
        1,
        "rgba(36,125,164,.22)"
      );

      ctx.fillStyle =
        liquidGrad;

      ctx.beginPath();

      ctx.moveTo(
        vessel.x + 5,
        vessel.y + 76
      );

      ctx.lineTo(
        vessel.x +
          vessel.w -
          5,
        vessel.y + 76
      );

      ctx.lineTo(
        vessel.x +
          vessel.w -
          5,
        vessel.y +
          vessel.h -
          5
      );

      ctx.lineTo(
        vessel.x + 5,
        vessel.y +
          vessel.h -
          5
      );

      ctx.closePath();

      ctx.fill();


      // Liquid surface

      ctx.strokeStyle =
        "rgba(35,120,145,.55)";

      ctx.lineWidth =
        2;

      ctx.beginPath();

      ctx.moveTo(
        vessel.x + 7,
        vessel.y + 76
      );

      ctx.quadraticCurveTo(
        vessel.x +
          vessel.w / 2,
        vessel.y + 67,
        vessel.x +
          vessel.w -
          7,
        vessel.y + 76
      );

      ctx.stroke();


      // Electrolyte label

      ctx.fillStyle =
        "#24576a";

      ctx.font =
        "bold 15px Arial";

      ctx.textAlign =
        "center";

      ctx.fillText(
        "ELECTROLYTE",
        vessel.x +
          vessel.w / 2,
        vessel.y + 102
      );


      // ------------------------------------------------------
      // ELECTRODES
      // ------------------------------------------------------

      const anodeX =
        305;

      const cathodeX =
        590;

      const electrodeY =
        126;

      const electrodeW =
        34;

      const electrodeH =
        155;


      const electrodeGrad =
        ctx.createLinearGradient(
          0,
          electrodeY,
          0,
          electrodeY +
            electrodeH
        );

      electrodeGrad.addColorStop(
        0,
        "#7a8794"
      );

      electrodeGrad.addColorStop(
        .5,
        "#475569"
      );

      electrodeGrad.addColorStop(
        1,
        "#263646"
      );

      ctx.fillStyle =
        electrodeGrad;

      ctx.fillRect(
        anodeX,
        electrodeY,
        electrodeW,
        electrodeH
      );

      ctx.fillRect(
        cathodeX,
        electrodeY,
        electrodeW,
        electrodeH
      );


      // Electrode shine

      ctx.fillStyle =
        "rgba(255,255,255,.20)";

      ctx.fillRect(
        anodeX + 5,
        electrodeY + 5,
        5,
        electrodeH - 10
      );

      ctx.fillRect(
        cathodeX + 5,
        electrodeY + 5,
        5,
        electrodeH - 10
      );


      // ------------------------------------------------------
      // ELECTRODE LABELS
      // ------------------------------------------------------

      ctx.font =
        "bold 17px Arial";

      ctx.fillStyle =
        "#a93226";

      ctx.fillText(
        "ANODE (+)",
        anodeX +
          electrodeW / 2,
        112
      );

      ctx.fillStyle =
        "#2166a5";

      ctx.fillText(
        "CATHODE (−)",
        cathodeX +
          electrodeW / 2,
        112
      );


      // ------------------------------------------------------
      // EXTERNAL WIRES
      //
      // Important:
      // Wires remain outside the electrolyte.
      // ------------------------------------------------------

      ctx.strokeStyle =
        "#334155";

      ctx.lineWidth =
        4;


      // Positive terminal → anode

      ctx.beginPath();

      ctx.moveTo(
        batteryX + 28,
        batteryY + batteryH
      );

      ctx.lineTo(
        batteryX + 28,
        151
      );

      ctx.lineTo(
        anodeX +
          electrodeW / 2,
        151
      );

      ctx.stroke();


      // Negative terminal → cathode

      ctx.beginPath();

      ctx.moveTo(
        batteryX +
          batteryW -
          28,
        batteryY + batteryH
      );

      ctx.lineTo(
        batteryX +
          batteryW -
          28,
        164
      );

      ctx.lineTo(
        cathodeX +
          electrodeW / 2,
        164
      );

      ctx.stroke();


      // External circuit label

      ctx.fillStyle =
        "#7b8794";

      ctx.font =
        "12px Arial";

      ctx.fillText(
        "external circuit",
        154,
        158
      );


      // ------------------------------------------------------
      // ION PARTICLES
      // ------------------------------------------------------

      const ionCount =
        5;

      for (
        let i = 0;
        i < ionCount;
        i++
      ) {

        const y =
          180 +
          i * 21;

        const base =
          (
            motion *
              (
                22 +
                i * 3
              ) +
            i * 72
          ) %
          245;


        // ----------------------------------------------------
        // CATIONS → CATHODE
        // ----------------------------------------------------

        const cationX =
          365 +
          base;

        const safeCationX =
          Math.min(
            cationX,
            cathodeX - 22
          );

        ctx.beginPath();

        ctx.fillStyle =
          "rgba(226,82,82,.88)";

        ctx.arc(
          safeCationX,
          y,
          7,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
          "#ffffff";

        ctx.font =
          "bold 9px Arial";

        ctx.fillText(
          "+",
          safeCationX,
          y + 3
        );


        // ----------------------------------------------------
        // ANIONS → ANODE
        // ----------------------------------------------------

        const anionX =
          545 -
          base;

        const safeAnionX =
          Math.max(
            anionX,
            anodeX +
              electrodeW +
              22
          );

        ctx.beginPath();

        ctx.fillStyle =
          "rgba(47,116,190,.88)";

        ctx.arc(
          safeAnionX,
          y + 8,
          7,
          0,
          Math.PI * 2
        );

        ctx.fill();

        ctx.fillStyle =
          "#ffffff";

        ctx.font =
          "bold 9px Arial";

        ctx.fillText(
          "−",
          safeAnionX,
          y + 11
        );
      }


      // ------------------------------------------------------
      // CATION MOVEMENT ARROW
      // ------------------------------------------------------

      ctx.strokeStyle =
        "#d14b4b";

      ctx.lineWidth =
        2.5;

      ctx.beginPath();

      ctx.moveTo(
        392,
        285
      );

      ctx.lineTo(
        555,
        285
      );

      ctx.lineTo(
        542,
        278
      );

      ctx.moveTo(
        555,
        285
      );

      ctx.lineTo(
        542,
        292
      );

      ctx.stroke();

      ctx.fillStyle =
        "#b33b3b";

      ctx.font =
        "bold 12px Arial";

      ctx.fillText(
        "CATIONS → CATHODE",
        475,
        305
      );


      // ------------------------------------------------------
      // ANION MOVEMENT ARROW
      // ------------------------------------------------------

      ctx.strokeStyle =
        "#3272b6";

      ctx.beginPath();

      ctx.moveTo(
        520,
        245
      );

      ctx.lineTo(
        360,
        245
      );

      ctx.lineTo(
        373,
        238
      );

      ctx.moveTo(
        360,
        245
      );

      ctx.lineTo(
        373,
        252
      );

      ctx.stroke();

      ctx.fillStyle =
        "#28609b";

      ctx.fillText(
        "← ANIONS → ANODE",
        440,
        232
      );


      // ------------------------------------------------------
      // METAL DEPOSIT AT CATHODE
      // ------------------------------------------------------

      const depositHeight =
        clamp(
          4 +
            mass * 28,
          4,
          82
        );


      const depositGrad =
        ctx.createLinearGradient(
          cathodeX - 9,
          electrodeY +
            electrodeH,
          cathodeX + 3,
          electrodeY +
            electrodeH
        );

      depositGrad.addColorStop(
        0,
        "#d7b24c"
      );

      depositGrad.addColorStop(
        .5,
        "#f2d36b"
      );

      depositGrad.addColorStop(
        1,
        "#a98427"
      );

      ctx.fillStyle =
        depositGrad;

      ctx.fillRect(
        cathodeX - 9,
        electrodeY +
          electrodeH -
          depositHeight,
        9,
        depositHeight
      );


      // Deposit label

      ctx.fillStyle =
        "#765b17";

      ctx.font =
        "bold 11px Arial";

      ctx.textAlign =
        "left";

      ctx.fillText(
        "deposit",
        cathodeX + 43,
        electrodeY +
          electrodeH -
          depositHeight +
          6
      );


      // ------------------------------------------------------
      // LIVE LEARNING STATUS STRIP
      // ------------------------------------------------------

      ctx.fillStyle =
        "rgba(255,255,255,.90)";

      ctx.strokeStyle =
        "#d7e3df";

      ctx.lineWidth =
        1;

      ctx.beginPath();

      ctx.roundRect(
        24,
        330,
        712,
        24,
        8
      );

      ctx.fill();

      ctx.stroke();


      ctx.textAlign =
        "left";

      ctx.fillStyle =
        "#35584b";

      ctx.font =
        "bold 12px Arial";

      ctx.fillText(
        `I = ${I.toFixed(1)} A   •   t = ${t.toFixed(0)} s   •   Q = ${Q.toFixed(1)} C   •   m = ${mass.toFixed(4)} g`,
        38,
        347
      );


      // ------------------------------------------------------
      // RESULT PANEL
      // ------------------------------------------------------

      result.innerHTML = `

        <div
          style="
            display:grid;
            grid-template-columns:
              repeat(3,minmax(0,1fr));
            gap:10px;
            margin-bottom:12px;
          "
        >

          <div
            style="
              background:#eef7ff;
              border:1px solid #cfe2f5;
              border-radius:10px;
              padding:10px;
              text-align:center;
            "
          >
            <div
              style="
                font-size:12px;
                color:#5f7080;
              "
            >
              Charge passed
            </div>

            <strong
              style="
                font-size:18px;
                color:#245f8e;
              "
            >
              ${Q.toFixed(2)} C
            </strong>
          </div>


          <div
            style="
              background:#fff8e8;
              border:1px solid #ead9a5;
              border-radius:10px;
              padding:10px;
              text-align:center;
            "
          >
            <div
              style="
                font-size:12px;
                color:#756438;
              "
            >
              Amount deposited
            </div>

            <strong
              style="
                font-size:18px;
                color:#8b6a17;
              "
            >
              ${moles.toFixed(6)} mol
            </strong>
          </div>


          <div
            style="
              background:#eef8f2;
              border:1px solid #cfe4d6;
              border-radius:10px;
              padding:10px;
              text-align:center;
            "
          >
            <div
              style="
                font-size:12px;
                color:#5c7265;
              "
            >
              Mass deposited
            </div>

            <strong
              style="
                font-size:18px;
                color:#286247;
              "
            >
              ${mass.toFixed(4)} g
            </strong>
          </div>

        </div>


        <div
          style="
            font-size:14px;
            line-height:1.55;
          "
        >

          <strong>
            Faraday's first law:
          </strong>

          m = MIt / nF

          <br>

          <span
            style="
              color:#66746d;
            "
          >
            Increase current or time →
            more charge →
            more mass deposited.

            Increase valency →
            less mass deposited
            for the same charge.
          </span>

        </div>
      `;


      // ------------------------------------------------------
      // CONTINUOUS ION ANIMATION
      //
      // Respect the user's reduced-motion preference.
      // ------------------------------------------------------

      if (
        !window.matchMedia ||
        !window.matchMedia(
          "(prefers-reduced-motion: reduce)"
        ).matches
      ) {

        if (
          !canvas.__electrolysisAnimation
        ) {

          const animate =
            () => {

              if (
                !document.body.contains(
                  canvas
                )
              ) {

                canvas.__electrolysisAnimation =
                  null;

                return;
              }

              electrolysis();

              canvas.__electrolysisAnimation =
                requestAnimationFrame(
                  animate
                );
            };


          canvas.__electrolysisAnimation =
            requestAnimationFrame(
              animate
            );
        }
      }
    }

       // ========================================================
    // SIMULATION DISPATCH
    // ========================================================

    const draw = {

      projectile_motion:
        projectile,

      ohms_law:
        ohm,

      hookes_law:
        hooke,

      uniform_acceleration:
        uniformAcceleration,

      simple_pendulum:
        pendulum,

      series_parallel_circuit:
        circuit,

      wave_motion:
        wave,

      lens_formula:
        lens,

      transformer:
        transformer,

      density_pressure:
        densityPressure,

      gas_law:
        gasLaw,

      probability:
        probability,

      electromagnetic_induction:
        electromagneticInduction,

      electrolysis:
        electrolysis
    };


    // ========================================================
    // SIMULATION RANGES
    // ========================================================

    const ranges = {

      projectile_motion: [
        [
          "Initial velocity u (m/s)",
          "velocity",
          1,
          100,
          .5
        ],
        [
          "Angle θ (°)",
          "angle",
          5,
          85,
          1
        ],
        [
          "Gravity g (m/s²)",
          "gravity",
          .1,
          30,
          .1
        ]
      ],


      ohms_law: [
        [
          "Voltage V (V)",
          "voltage",
          0,
          50,
          .5
        ],
        [
          "Resistance R (Ω)",
          "resistance",
          .1,
          100,
          .1
        ]
      ],


      hookes_law: [
        [
          "Force F (N)",
          "force",
          0,
          50,
          .5
        ],
        [
          "Spring constant k (N/m)",
          "springConstant",
          1,
          200,
          1
        ]
      ],


      uniform_acceleration: [
        [
          "Initial velocity u (m/s)",
          "u",
          -20,
          50,
          .5
        ],
        [
          "Acceleration a (m/s²)",
          "acceleration",
          -10,
          20,
          .1
        ],
        [
          "Time t (s)",
          "time",
          0,
          20,
          .1
        ]
      ],


      simple_pendulum: [
        [
          "Length L (m)",
          "length",
          .2,
          5,
          .1
        ],
        [
          "Gravity g (m/s²)",
          "gravity",
          .1,
          30,
          .1
        ]
      ],


      series_parallel_circuit: [
        [
          "Resistance R1 (Ω)",
          "resistance1",
          .1,
          100,
          .1
        ],
        [
          "Resistance R2 (Ω)",
          "resistance2",
          .1,
          100,
          .1
        ],
        [
          "Voltage V (V)",
          "voltage",
          0,
          100,
          .5
        ]
      ],


      wave_motion: [
        [
          "Amplitude",
          "amplitude",
          .1,
          5,
          .1
        ],
        [
          "Frequency",
          "frequency",
          .1,
          10,
          .1
        ],
        [
          "Wavelength",
          "wavelength",
          .1,
          10,
          .1
        ]
      ],


      lens_formula: [
        [
          "Focal length f (cm)",
          "focalLength",
          1,
          100,
          1
        ],
        [
          "Object distance u (cm)",
          "objectDistance",
          1,
          200,
          1
        ]
      ],


      transformer: [
        [
          "Primary voltage Vp (V)",
          "primaryVoltage",
          1,
          1000,
          1
        ],
        [
          "Primary turns Np",
          "primaryTurns",
          1,
          10000,
          10
        ],
        [
          "Secondary turns Ns",
          "secondaryTurns",
          1,
          10000,
          10
        ]
      ],


      density_pressure: [
        [
          "Density ρ (kg/m³)",
          "density",
          .1,
          20000,
          10
        ],
        [
          "Depth h (m)",
          "depth",
          0,
          100,
          .1
        ],
        [
          "Gravity g (m/s²)",
          "gravity",
          .1,
          30,
          .1
        ]
      ],


      gas_law: [
        [
          "Pressure P",
          "pressure",
          1,
          1000,
          1
        ],
        [
          "Volume V",
          "volume",
          .1,
          20,
          .1
        ],
        [
          "Temperature T",
          "temperature",
          1,
          2000,
          1
        ]
      ],


      probability: [
        [
          "Favourable outcomes",
          "favourable",
          0,
          100,
          1
        ],
        [
          "Total outcomes",
          "total",
          1,
          100,
          1
        ]
      ],


      electromagnetic_induction: [
        [
          "Number of turns (N)",
          "turns",
          1,
          200,
          1
        ],
        [
          "Velocity (v)",
          "velocity",
          0,
          10,
          .1
        ],
        [
          "Magnetic field (B)",
          "magneticField",
          0,
          2,
          .1
        ]
      ],


      electrolysis: [
        [
          "Current I (A)",
          "current",
          0,
          20,
          .1
        ],
        [
          "Time t (s)",
          "time",
          1,
          7200,
          10
        ],
        [
          "Molar mass M (g/mol)",
          "molarMass",
          1,
          300,
          .5
        ],
        [
          "Valency n",
          "valency",
          1,
          6,
          1
        ]
      ]
    };


    // ========================================================
    // BUILD CONTROLS
    // ========================================================

    (
      ranges[type] || []
    ).forEach(
      ([
        label,
        key,
        min,
        max,
        step
      ]) => {

        const value =
          clamp(
            num(
              state[key],
              SIMS[type].defaults[key]
            ),
            min,
            max
          );

        state[key] =
          value;

        slider(
          controls,
          label,
          value,
          min,
          max,
          step,
          newValue => {

            state[key] =
              newValue;

            draw[type]();
          }
        );
      }
    );


    // Initial render
    draw[type]();


    return el;
  }


  // ==========================================================
  // IMAGE METADATA
  // ==========================================================

  function renderImage(v) {

    const el =
      document.createElement(
        "article"
      );

    el.className =
      "nbv3-card";

    el.innerHTML = `
      <div class="nbv3-title">
        🖼️ ${esc(
          v.caption ||
          "Educational Illustration"
        )}
      </div>

      <div class="nbv3-image-spec">

        <strong>
          Illustration specification
        </strong>

        <p>
          ${esc(
            v.alt ||
            "Educational illustration"
          )}
        </p>

        ${
          v.imageQuery
            ? `
              <small>
                Suggested subject:
                ${esc(v.imageQuery)}
              </small>
            `
            : ""
        }

      </div>
    `;

    return el;
  }


  // ==========================================================
  // COMPONENT DISPATCH
  // ==========================================================

  function renderVisual(v) {

    if (
      !v ||
      typeof v !== "object"
    ) {
      return null;
    }

    switch (
      String(
        v.type || ""
      ).toLowerCase()
    ) {

      case "equation":
        return renderEquation(v);


      case "diagram":
        return renderDiagram(v);


      case "graph":
        return renderGraph(v);


      case "table":
        return renderTable(v);


      case "comparison":
        return renderTable(
          v,
          true
        );


      case "flowchart":
        return renderFlow(v);


      case "process":
        return renderFlow(
          v,
          true
        );


      case "interactive":
        return renderInteractive(v);


      case "simulation":
        return renderSimulation(v);


      case "image":
        return renderImage(v);


      default:
        return null;
    }
  }


  // ==========================================================
  // MOUNT VISUALS
  // ==========================================================

  function mountVisuals(data) {

    const rawVisuals =
  data?.note?.visualComponents ??
  data?.note?.["Visual Components"] ??
  [];

let visuals = [];

if (Array.isArray(rawVisuals)) {
  visuals = rawVisuals.slice(
    0,
    MAX_VISUALS
  );
} else if (typeof rawVisuals === "string") {
  try {
    const parsed = JSON.parse(rawVisuals);

    if (Array.isArray(parsed)) {
      visuals = parsed.slice(
        0,
        MAX_VISUALS
      );
    }
  } catch {
    visuals = [];
  }
}


    if (!visuals.length) {
      return;
    }


    const host =
      document.getElementById(
        "notePromptPreview"
      );


    if (!host) {

      console.warn(
        "NoteBank visual host not found."
      );

      return;
    }


    injectStyles();


    // Remove previous visual section
    const old =
      document.getElementById(
        "nbv3-visuals"
      );


    if (old) {
      old.remove();
    }


    // Main visual container
    const wrap =
      document.createElement(
        "section"
      );

    wrap.id =
      "nbv3-visuals";

    wrap.className =
      "nbv3-visuals";


    // Heading
    const heading =
      document.createElement(
        "h3"
      );

    heading.textContent =
      "📚 Visual Learning Components";


    wrap.appendChild(
      heading
    );


    let rendered =
      0;


    // Render every valid visual component
    visuals.forEach(
      v => {

        try {

          const component =
            renderVisual(v);


          if (component) {

            wrap.appendChild(
              component
            );

            rendered++;
          }

        } catch (error) {

          console.warn(
            "NoteBank visual component skipped:",
            error
          );
        }
      }
    );


    if (!rendered) {
      return;
    }


    host.parentNode.insertBefore(
      wrap,
      host
    );
  }


  // ==========================================================
  // SAFE PUBLIC API
  // ==========================================================

  window.AINoteVisuals = {

    version:
      "3.0",

    mount:
      mountVisuals,

    simulations:
      Object.keys(
        SIMS
      )
  };


  // ==========================================================
  // FINAL ENGINE MESSAGE
  // ==========================================================

  console.log(
    "Aibinu Flexiprep NoteBank Visual Learning Engine v3 loaded."
  );


})();
