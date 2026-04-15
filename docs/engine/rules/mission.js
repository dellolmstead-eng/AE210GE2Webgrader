import { STRINGS } from "../messages.js";
import { getCell, getCellByIndex, asNumber } from "../parseUtils.js";

const LEG_COLUMNS = [11, 12, 13, 14, 16, 18, 19, 22, 23]; // 1-based column indices
const ROWS = {
  altitude: 33,
  mach: 35,
  afterburner: 36,
  distance: 38,
  time: 39,
};
const missionTolAlt = 10;
const missionTolMach = 0.05;
const missionTolTime = 0.1;
const missionTolDist = 0.5;

export function runMissionChecks(workbook) {
  const feedback = [];
  let missionFailed = false;

  const main = workbook.sheets.main;
  const constraintsMach = asNumber(getCell(main, "U4"));
  const combatTurnAngle = asNumber(getCell(main, "AB39"));

  const readRowValues = (rowIndex) =>
    LEG_COLUMNS.map((col) => asNumber(getCellByIndex(main, rowIndex, col)));

  const altitude = readRowValues(ROWS.altitude);
  const mach = readRowValues(ROWS.mach);
  const afterburner = readRowValues(ROWS.afterburner);
  const distance = readRowValues(ROWS.distance);
  const time = readRowValues(ROWS.time);

  const fmt = (value, digits) => (Number.isFinite(value) ? value.toFixed(digits) : "NaN");

  if (Math.abs(altitude[0] - 0) > missionTolAlt || Math.abs(afterburner[0] - 100) > missionTolAlt) {
    feedback.push(`Leg 1: Altitude must be 0 and AB = 100 (found alt=${fmt(altitude[0], 1)}, AB=${fmt(afterburner[0], 1)})`);
    missionFailed = true;
  }

  if (!(altitude[1] >= altitude[0] - missionTolAlt && altitude[1] <= altitude[2] + missionTolAlt)) {
    feedback.push(`Leg 2: Altitude must be between Leg 1 and Leg 3 (found alt2=${fmt(altitude[1], 1)}, alt1=${fmt(altitude[0], 1)}, alt3=${fmt(altitude[2], 1)})`);
    missionFailed = true;
  }
  if (!(mach[1] >= mach[0] - missionTolMach && mach[1] <= mach[2] + missionTolMach)) {
    feedback.push(`Leg 2: Mach must be between Leg 1 and Leg 3 (found mach2=${fmt(mach[1], 2)}, mach1=${fmt(mach[0], 2)}, mach3=${fmt(mach[2], 2)})`);
    missionFailed = true;
  }
  if (Math.abs(afterburner[1] - 0) > missionTolAlt) {
    feedback.push(`Leg 2: AB must be 0 (found AB=${fmt(afterburner[1], 1)})`);
    missionFailed = true;
  }

  if (altitude[2] < 35000 - missionTolAlt || Math.abs(mach[2] - 0.9) > missionTolMach || Math.abs(afterburner[2] - 0) > missionTolAlt) {
    feedback.push(`Leg 3: Must be ≥35,000 ft, Mach = 0.9, AB = 0 (found alt=${fmt(altitude[2], 1)}, mach=${fmt(mach[2], 2)}, AB=${fmt(afterburner[2], 1)})`);
    missionFailed = true;
  }

  if (altitude[3] < 35000 - missionTolAlt || Math.abs(mach[3] - 0.9) > missionTolMach || Math.abs(afterburner[3] - 0) > missionTolAlt) {
    feedback.push(`Leg 4: Must be ≥35,000 ft, Mach = 0.9, AB = 0 (found alt=${fmt(altitude[3], 1)}, mach=${fmt(mach[3], 2)}, AB=${fmt(afterburner[3], 1)})`);
    missionFailed = true;
  }

  if (
    altitude[4] < 35000 - missionTolAlt ||
    constraintsMach == null ||
    Math.abs(mach[4] - constraintsMach) > missionTolMach ||
    Math.abs(afterburner[4] - 0) > missionTolAlt ||
    distance[4] < 150 - missionTolDist
  ) {
    feedback.push(`Leg 5: Must be ≥35,000 ft, Mach = Contraints block Supercruise Mach (cell U4), AB = 0, Distance ≥ 150 nm (found alt=${fmt(altitude[4], 1)}, mach=${fmt(mach[4], 2)}, AB=${fmt(afterburner[4], 1)}, dist=${fmt(distance[4], 1)})`);
    missionFailed = true;
  }

  if (altitude[5] < 30000 - missionTolAlt || mach[5] < 1.2 - missionTolMach || Math.abs(afterburner[5] - 100) > missionTolAlt) {
    feedback.push(`Leg 6: Must be ≥30,000 ft, Mach ≥ 1.2, AB = 100 (found alt=${fmt(altitude[5], 1)}, mach=${fmt(mach[5], 2)}, AB=${fmt(afterburner[5], 1)})`);
    missionFailed = true;
  }
  if (!(combatTurnAngle >= 720)) {
    feedback.push("Two full 360 turns are required. Increase total turn angle (cell AB39) to 720 degrees or greater to meet the combat turn requirement");
    missionFailed = true;
  }

  if (
    altitude[6] < 35000 - missionTolAlt ||
    constraintsMach == null ||
    Math.abs(mach[6] - constraintsMach) > missionTolMach ||
    Math.abs(afterburner[6] - 0) > missionTolAlt ||
    distance[6] < 150 - missionTolDist
  ) {
    feedback.push(`Leg 7: Must be ≥35,000 ft, Mach = Contraints block Supercruise Mach (cell U4), AB = 0, Distance ≥ 150 nm (found alt=${fmt(altitude[6], 1)}, mach=${fmt(mach[6], 2)}, AB=${fmt(afterburner[6], 1)}, dist=${fmt(distance[6], 1)})`);
    missionFailed = true;
  }

  if (altitude[7] < 35000 - missionTolAlt || Math.abs(mach[7] - 0.9) > missionTolMach || Math.abs(afterburner[7] - 0) > missionTolAlt) {
    feedback.push(`Leg 8: Must be ≥35,000 ft, Mach = 0.9, AB = 0 (found alt=${fmt(altitude[7], 1)}, mach=${fmt(mach[7], 2)}, AB=${fmt(afterburner[7], 1)})`);
    missionFailed = true;
  }

  if (
    Math.abs(altitude[8] - 10000) > missionTolAlt ||
    Math.abs(mach[8] - 0.4) > missionTolMach ||
    Math.abs(afterburner[8] - 0) > missionTolAlt ||
    Math.abs(time[8] - 20) > missionTolTime
  ) {
    feedback.push(`Leg 9: Must be 10,000 ft, Mach = 0.4, AB = 0, Time = 20 min (found alt=${fmt(altitude[8], 1)}, mach=${fmt(mach[8], 2)}, AB=${fmt(afterburner[8], 1)}, time=${fmt(time[8], 2)})`);
    missionFailed = true;
  }

  if (missionFailed) {
    feedback.push(STRINGS.missionSummary);
  }

  return { delta: 0, feedback };
}
