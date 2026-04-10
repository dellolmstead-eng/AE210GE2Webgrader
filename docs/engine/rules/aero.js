import { STRINGS } from "../messages.js";
import { asNumber, getCell } from "../parseUtils.js";

const CHECKS = [
  ["G3", "G4"],
  ["G10", "G11"],
  ["A15", "A16"],
];
const COEFF_MIN = 0.1;
const COEFF_MAX = 0.105;
const COEFF_TOL = 0.001;

function inferA15Coefficient(a15, a19, mach) {
  if (!Number.isFinite(a15) || !Number.isFinite(a19) || !Number.isFinite(mach) || a19 <= 0 || mach <= 0) {
    return Number.NaN;
  }
  const k = 57.3 / (Math.PI * a19 * mach);
  const denom = 1 - k * a15;
  if (!Number.isFinite(denom) || denom <= 0) {
    return Number.NaN;
  }
  return a15 / denom;
}

export function runAeroChecks(workbook) {
  const { aero, main } = workbook.sheets;
  const feedback = [];
  let failures = 0;

  CHECKS.forEach(([refA, refB]) => {
    const valueA = getCell(aero, refA);
    const valueB = getCell(aero, refB);
    if (valueA === valueB) {
      failures += 1;
    }
  });

  const inferredCoeff = inferA15Coefficient(
    asNumber(getCell(aero, "A15")),
    asNumber(getCell(aero, "A19")),
    asNumber(getCell(main, "B19"))
  );
  if (
    Number.isFinite(inferredCoeff) &&
    (inferredCoeff < COEFF_MIN - COEFF_TOL || inferredCoeff > COEFF_MAX + COEFF_TOL)
  ) {
    failures += 1;
    feedback.push(
      STRINGS.aeroCoeffRange
        .replace("%s", inferredCoeff.toFixed(3))
        .replace("%s", COEFF_MIN.toFixed(3))
        .replace("%s", COEFF_MAX.toFixed(3))
    );
  }

  if (failures > 0) {
    const message = STRINGS.aeroMismatch.replace("%d", Math.min(2, failures));
    feedback.push(message);
  }

  return {
    delta: -Math.min(2, failures),
    feedback,
  };
}
