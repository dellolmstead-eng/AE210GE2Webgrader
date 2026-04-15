import { STRINGS } from "../messages.js";
import { getCell } from "../parseUtils.js";

const CHECKS = [
  ["G3", "G4"],
  ["G10", "G11"],
  ["A15", "A16"],
];

export function runAeroChecks(workbook) {
  const { aero } = workbook.sheets;
  const feedback = [];
  let failures = 0;

  CHECKS.forEach(([refA, refB]) => {
    const valueA = getCell(aero, refA);
    const valueB = getCell(aero, refB);
    if (valueA === valueB) {
      failures += 1;
    }
  });

  if (failures > 0) {
    const message = STRINGS.aeroMismatch.replace("%d", Math.min(2, failures));
    feedback.push(message);
  }

  return {
    delta: -Math.min(2, failures),
    feedback,
  };
}
