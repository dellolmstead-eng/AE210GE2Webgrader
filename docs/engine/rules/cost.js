import { STRINGS } from "../messages.js";
import { getCell, asNumber } from "../parseUtils.js";
import { format } from "../format.js";

export function runRecurringCostChecks(workbook) {
  const feedback = [];
  let costDelta = 0;

  const main = workbook.sheets.main;
  const cost = asNumber(getCell(main, "Q31"));
  const numAircraft = asNumber(getCell(main, "N31"));

  if (numAircraft === 187) {
    if (cost != null && cost > 115) {
      feedback.push(format(STRINGS.cost.over187, cost));
      costDelta -= 1;
    } else if (cost != null && cost <= 100) {
      feedback.push(format(STRINGS.cost.obj187, cost));
    }
  } else if (numAircraft === 800) {
    if (cost != null && cost > 75) {
      feedback.push(format(STRINGS.cost.over800, cost));
      costDelta -= 1;
    } else if (cost != null && cost <= 61) {
      feedback.push(format(STRINGS.cost.obj800, cost));
    }
  } else {
    feedback.push(format(STRINGS.cost.invalid, numAircraft));
    costDelta -= 1;
  }

  return { delta: costDelta, feedback };
}
