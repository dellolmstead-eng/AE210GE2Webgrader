import { STRINGS } from "../messages.js";
import { getCell, asNumber } from "../parseUtils.js";
import { format } from "../format.js";

const FUEL_TOL = 5e-2;

export function runFuelVolumeChecks(workbook) {
  const feedback = [];
  let delta = 0;

  const main = workbook.sheets.main;
  const fuelAvailable = asNumber(getCell(main, "O18"));
  const fuelExtra = asNumber(getCell(main, "O19"));
  const fuelRequired = asNumber(getCell(main, "X40"));
  if (!Number.isFinite(fuelAvailable) || !Number.isFinite(fuelRequired)) {
    feedback.push(STRINGS.fuel.invalid);
    delta -= 1;
  } else if (fuelAvailable + FUEL_TOL < fuelRequired) {
    feedback.push(
      format(STRINGS.fuel.shortage, fuelAvailable, fuelRequired)
    );
    delta -= 1;
  } else if (Number.isFinite(fuelExtra) && fuelExtra < -FUEL_TOL) {
    feedback.push(format(STRINGS.fuel.extraNegative, fuelExtra));
    delta -= 1;
  }

  const volumeRemaining = asNumber(getCell(main, "Q23"));
  if (!(volumeRemaining > 0)) {
    feedback.push(
      format(STRINGS.fuel.volume, volumeRemaining)
    );
    delta -= 1;
  }

  return { delta, feedback };
}
