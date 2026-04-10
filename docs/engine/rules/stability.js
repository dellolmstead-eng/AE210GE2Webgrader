import { STRINGS } from "../messages.js";
import { getCell, asNumber } from "../parseUtils.js";

export function runStabilityChecks(workbook) {
  const feedback = [];
  let delta = 0;
  let stabilityPass = true;

  const main = workbook.sheets.main;

  const sm = asNumber(getCell(main, "M10"));
  const clb = asNumber(getCell(main, "O10"));
  const cnb = asNumber(getCell(main, "P10"));
  const ratio = asNumber(getCell(main, "Q10"));

  if (!(sm >= -0.1 && sm <= 0.11)) {
    feedback.push(STRINGS.stability.sm);
    stabilityPass = false;
  } else if (sm < 0) {
    feedback.push(STRINGS.stability.smWarn);
  }

  if (!(clb < -0.001)) {
    feedback.push(STRINGS.stability.clb);
    stabilityPass = false;
  }

  if (!(cnb > 0.002)) {
    feedback.push(STRINGS.stability.cnb);
    stabilityPass = false;
  }

  if (!(ratio >= 0.3 && ratio <= 1)) {
    feedback.push(STRINGS.stability.ratio);
    stabilityPass = false;
  }

  if (!stabilityPass) {
    feedback.push(STRINGS.stability.deduction);
    delta -= 1;
  }

  return { delta, feedback };
}
