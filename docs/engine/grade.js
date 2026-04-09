import { STRINGS } from "./messages.js";
import { runMissionChecks } from "./rules/mission.js";
import { runAeroChecks } from "./rules/aero.js";
import { runThrustAndTakeoff } from "./rules/thrust.js";
import { runConstraintChecks } from "./rules/constraints.js";
import { runAttachmentChecks } from "./rules/attachments.js";
import { runStabilityChecks } from "./rules/stability.js";
import { runFuelVolumeChecks } from "./rules/fuel.js";
import { runRecurringCostChecks } from "./rules/cost.js";
import { runLandingGearChecks } from "./rules/landingGear.js";

function cellRef(rowIdx, colIdx) {
  let col = "";
  let n = colIdx;
  while (n >= 0) {
    col = String.fromCharCode((n % 26) + 65) + col;
    n = Math.floor(n / 26) - 1;
  }
  return `${col}${rowIdx + 1}`;
}

export function gradeWorkbook(workbook, rules) {
  // Preflight: abort if Main sheet contains Excel errors / invalid cells
  if (workbook.sheets?.main) {
    const invalidCells = [];
    workbook.sheets.main.forEach((row, rIdx) => {
      if (rIdx > 74) {
        return;
      }
      if (!row) {
        return;
      }
      row.forEach((value, cIdx) => {
        if (cIdx > 32) {
          return;
        }
        if (typeof value === "string" && /^#(DIV\/0!|VALUE!|REF!|NAME\?|NUM!|NULL!|N\/A)$/i.test(value.trim())) {
          invalidCells.push(cellRef(rIdx, cIdx));
        } else if (typeof value === "number" && !Number.isFinite(value)) {
          invalidCells.push(cellRef(rIdx, cIdx));
        }
      });
    });
    if (invalidCells.length > 0) {
      const msg = `Invalid for analysis: Excel errors in Main sheet at ${invalidCells.join(", ")}. Correct the errors and resubmit.`;
      return {
        score: 0,
        maxScore: 10,
        scoreLine: msg,
        cutoutLine: "",
        feedbackLog: msg,
      };
    }
  }

  const feedback = [];
  let score = 10;

  if (workbook.fileName) {
    feedback.push(workbook.fileName);
  }

  // Aero tab deductions
  const aeroResult = runAeroChecks(workbook, rules);
  score += aeroResult.delta;
  feedback.push(...aeroResult.feedback);

  // Mission advisory checks (no point change)
  const missionResult = runMissionChecks(workbook, rules);
  feedback.push(...missionResult.feedback);

  // Thrust / takeoff roll
  const thrustResult = runThrustAndTakeoff(workbook, rules);
  score += thrustResult.delta;
  feedback.push(...thrustResult.feedback);

  // Constraint table
  const constraintResult = runConstraintChecks(workbook, rules);
  score += constraintResult.delta;
  feedback.push(...constraintResult.feedback);

  // Control surface attachment
  const attachmentResult = runAttachmentChecks(workbook, rules);
  score += attachmentResult.delta;
  feedback.push(...attachmentResult.feedback);

  // Stability
  const stabilityResult = runStabilityChecks(workbook, rules);
  score += stabilityResult.delta;
  feedback.push(...stabilityResult.feedback);

  // Fuel & volume
  const fuelResult = runFuelVolumeChecks(workbook, rules);
  score += fuelResult.delta;
  feedback.push(...fuelResult.feedback);

  // Recurring cost
  const costResult = runRecurringCostChecks(workbook, rules);
  score += costResult.delta;
  feedback.push(...costResult.feedback);

  // Landing gear
  const gearResult = runLandingGearChecks(workbook, rules);
  score += gearResult.delta;
  feedback.push(...gearResult.feedback);

  const clampedScore = Math.max(0, score);

  const scoreLine = STRINGS.summary.score.replace("%d", clampedScore);
  const cutoutLine = STRINGS.summary.cutout;
  feedback.push(scoreLine);
  feedback.push(cutoutLine);

  return {
    score: clampedScore,
    maxScore: 10,
    scoreLine,
    cutoutLine,
    feedbackLog: feedback.join("\n"),
  };
}
