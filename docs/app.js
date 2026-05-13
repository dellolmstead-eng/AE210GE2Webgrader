import { loadWorkbook } from "./engine/loadWorkbook.js";
import { gradeWorkbook } from "./engine/grade.js";
import { RULES } from "./engine/rules.js";

const fileInput = document.getElementById("file-input");
const dropZone = document.getElementById("drop-zone");
const resultsSection = document.getElementById("results");
const scoreLine = document.getElementById("score-line");
const cutoutLine = document.getElementById("cutout-line");
const feedbackLog = document.getElementById("feedback-log");
const macroWarning = document.getElementById("macro-warning");
const statusMessage = document.getElementById("status-message");
const versionLine = document.getElementById("version-line");
const sessionCounter = document.getElementById("session-counter");
let gradedCount = 0;

if (versionLine) {
  versionLine.textContent = `Version: ${RULES.versionLabel}`;
}

function resetUI() {
  resultsSection.classList.add("hidden");
  macroWarning.classList.add("hidden");
  statusMessage.classList.add("hidden");
  statusMessage.textContent = "";
  scoreLine.textContent = "";
  cutoutLine.textContent = "";
  feedbackLog.textContent = "";
}

function updateSessionCounter(fileName = "") {
  if (!sessionCounter) return;
  const label = fileName
    ? `Files graded this session: ${gradedCount} (last: ${fileName})`
    : `Files graded this session: ${gradedCount}`;
  sessionCounter.textContent = label;
}

function showStatus(text, level = "info") {
  statusMessage.textContent = text;
  statusMessage.classList.remove("hidden", "info", "warning", "error");
  statusMessage.classList.add(level);
}

function showMacroWarning() {
  macroWarning.textContent = RULES.macroWarningText;
  macroWarning.classList.remove("hidden");
}

async function gradeFile(file) {
  resetUI();

  if (!file) {
    return;
  }

  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".xlsm") && !lowerName.endsWith(".xlsx")) {
    showStatus("Only .xlsm or .xlsx files are supported.", "error");
    return;
  }

  try {
    if (lowerName.endsWith(".xlsx")) {
      showMacroWarning();
    }

    showStatus("Loading workbook...", "info");
    const workbook = await loadWorkbook(file, RULES);
    const result = gradeWorkbook(workbook, RULES);

    scoreLine.textContent = result.scoreLine;
    cutoutLine.textContent = result.cutoutLine;
    feedbackLog.textContent = result.feedbackLog;

    resultsSection.classList.remove("hidden");
    showStatus("Grading complete.", "info");
    gradedCount += 1;
    updateSessionCounter(file.name);
  } catch (err) {
    console.error(err);
    showStatus(`Error: ${err?.message || "Unable to grade this file."}`, "error");
  }
}

function handleFiles(files) {
  if (!files || files.length === 0) {
    return;
  }
  const [file] = files;
  gradeFile(file);
  fileInput.value = "";
}

fileInput.addEventListener("change", (event) => {
  handleFiles(event.target.files);
});

dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  dropZone.classList.add("dragging");
});

dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("dragging");
});

dropZone.addEventListener("drop", (event) => {
  event.preventDefault();
  dropZone.classList.remove("dragging");
  handleFiles(event.dataTransfer.files);
});

updateSessionCounter();
