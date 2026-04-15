import { STRINGS } from "../messages.js";
import { getCell, getCellByIndex, asNumber } from "../parseUtils.js";
import { format } from "../format.js";
import { pchip } from "../pchip.js";

const COLS = { alt: 20, mach: 21, n: 22, ab: 23, ps: 24, cdx: 25, beta: 19 };
const tolMach = 0.01;
const tolAlt = 1;
const tolN = 0.05;
const tolAb = 1;
const tolPs = 1;
const tolBeta = 0.02;
const tolCdx = 0.0001;
const tolDist = 0.05;
const PAYLOAD_INT_TOL = 0.01;
const BETA_FALLBACK = null;

const CONSTRAINT_SPECS = [
  { label: "MaxMach", curveLabel: "MaxMach", row: 3, altMin: 35000, machMin: 2.0, machObj: 2.2, abEq: 100, psEq: 0, cdxEq: 0, betaDefault: true, curveRow: 23 },
  { label: "CruiseMach", curveLabel: "Supercruise", row: 4, altMin: 35000, machMin: 1.5, machObj: 1.8, abEq: 0, psEq: 0, cdxEq: 0, betaDefault: true, curveRow: 24 },
  { label: "Cmbt Turn1", curveLabel: "CombatTurn1", row: 6, machEq: 1.2, altEq: 30000, nMin: 3.0, nObj: 4.0, abEq: 100, psEq: 0, cdxEq: 0, betaDefault: true, curveRow: 26 },
  { label: "Cmbt Turn2", curveLabel: "CombatTurn2", row: 7, machEq: 0.9, altEq: 10000, nMin: 4.0, nObj: 4.5, abEq: 100, psEq: 0, cdxEq: 0, betaDefault: true, curveRow: 27 },
  { label: "Ps1", curveLabel: "Ps1", row: 8, machEq: 1.15, altEq: 30000, nEq: 1, abEq: 100, psMin: 400, psObj: 500, cdxEq: 0, betaDefault: true, curveRow: 28 },
  { label: "Ps2", curveLabel: "Ps2", row: 9, machEq: 0.9, altEq: 10000, nEq: 1, abEq: 0, psMin: 400, psObj: 500, cdxEq: 0, betaDefault: true, curveRow: 29 },
  {
    label: "Takeoff",
    row: 12,
    altEq: 0,
    machEq: 1.2,
    nEq: 0.03,
    abEq: 100,
    betaEq: 1,
    cdxAllowed: [0, 0.035],
    curveRow: 32,
    distance: { threshold: 3000, objective: 2500 },
  },
  {
    label: "Landing",
    row: 13,
    altEq: 0,
    machEq: 1.3,
    nEq: 0.5,
    abEq: 0,
    betaEq: 1,
    cdxAllowed: [0, 0.045],
    distance: { threshold: 5000, objective: 3500 },
  },
];

export function runConstraintChecks(workbook) {
  const feedback = [];
  let delta = 0;
  let failCount = 0;

  const main = workbook.sheets.main;
  const consts = workbook.sheets.consts;
  const curveMessages = [];
  const curveFailures = new Set();

  // Mission radius
  const radius = asNumber(getCell(main, "Y37"));
  if (radius != null && radius < 375 - tolDist) {
    feedback.push(format(STRINGS.constraint.radiusLow, radius));
    failCount += 1;
  } else if (radius != null && radius >= 410 - tolDist) {
    feedback.push(format(STRINGS.constraint.radiusObj, radius));
  }

  // Payload
  const aim120RawVal = asNumber(getCell(main, "AB3"));
  const aim9RawVal = asNumber(getCell(main, "AB4"));
  const aim120Raw = Number.isFinite(aim120RawVal) ? aim120RawVal : 0;
  const aim9Raw = Number.isFinite(aim9RawVal) ? aim9RawVal : 0;
  const aim120Int = Math.abs(aim120Raw - Math.round(aim120Raw)) <= PAYLOAD_INT_TOL ? Math.round(aim120Raw) : null;
  const aim9Int = Math.abs(aim9Raw - Math.round(aim9Raw)) <= PAYLOAD_INT_TOL ? Math.round(aim9Raw) : null;
  if (aim120Int == null || aim9Int == null) {
    feedback.push("Payload counts for AIM-120 and AIM-9 must be integers.");
    failCount += 1;
  } else if (aim120Int < 8) {
    feedback.push(format(STRINGS.constraint.payloadLow, aim120Int));
    failCount += 1;
  } else if (aim9Int >= 2) {
    feedback.push(format(STRINGS.constraint.payloadObj, aim120Int, aim9Int));
  }

  // Design point for curves
  const wsDesign = asNumber(getCell(main, "P13"));
  const twDesign = asNumber(getCell(main, "Q13"));
  const wsAxis = [];
  for (let col = 11; col <= 31; col += 1) {
    wsAxis.push(getCellByIndex(consts, 22, col));
  }

  // MATLAB logs threshold distance failures before the row-by-row objective lines.
  for (const spec of CONSTRAINT_SPECS) {
    if (!spec.distance) continue;
    const distCell = spec.label === "Takeoff" ? "X12" : spec.label === "Landing" ? "X13" : null;
    const distValue = distCell ? asNumber(getCell(main, distCell)) : Number.NaN;
    if (distCell && distValue != null && distValue > spec.distance.threshold + tolDist) {
      const msg = spec.label === "Takeoff" ? STRINGS.constraint.takeoffHigh : STRINGS.constraint.landingHigh;
      feedback.push(format(msg, distValue));
      failCount += 1;
    }
  }

  // Unified constraint/table/curve checks
  CONSTRAINT_SPECS.forEach((spec) => {
    const specFeedback = [];
    const row = spec.row;
    const mach = asNumber(getCellByIndex(main, row, COLS.mach));
    const altitude = asNumber(getCellByIndex(main, row, COLS.alt));
    const n = asNumber(getCellByIndex(main, row, COLS.n));
    const ab = asNumber(getCellByIndex(main, row, COLS.ab));
    const ps = asNumber(getCellByIndex(main, row, COLS.ps));
    const cdx = asNumber(getCellByIndex(main, row, COLS.cdx));
    const beta = asNumber(getCellByIndex(main, row, COLS.beta));

    if (spec.machEq != null) {
      if (!Number.isFinite(mach) || Math.abs(mach - spec.machEq) > tolMach) {
        specFeedback.push(format(STRINGS.constraint.machEq, spec.label, mach ?? NaN, spec.machEq));
        failCount += 1;
      }
    } else if (spec.machMin != null) {
      if (mach != null && mach < spec.machMin - tolMach) {
        specFeedback.push(format(STRINGS.constraint.machMin, spec.label, mach, spec.machMin));
        failCount += 1;
      } else if (mach != null && spec.machObj != null && mach >= spec.machObj - tolMach) {
        specFeedback.push(format(STRINGS.constraint.machObj, spec.label, spec.machObj, mach));
      }
    }

    if (spec.altEq != null) {
      if (altitude != null && Math.abs(altitude - spec.altEq) > tolAlt) {
        specFeedback.push(format(STRINGS.constraint.altEq, spec.label, altitude, spec.altEq));
        failCount += 1;
      }
    } else if (spec.altMin != null) {
      if (altitude != null && altitude < spec.altMin - tolAlt) {
        specFeedback.push(format(STRINGS.constraint.altMin, spec.label, altitude, spec.altMin));
        failCount += 1;
      }
    }

    if (spec.nEq != null) {
      if (n != null && Math.abs(n - spec.nEq) > tolN) {
        specFeedback.push(format(STRINGS.constraint.nEq, spec.label, n, spec.nEq));
        failCount += 1;
      }
    } else if (spec.nMin != null) {
      if (n != null && n < spec.nMin - tolN) {
        specFeedback.push(format(STRINGS.constraint.nMin, spec.label, n, spec.nMin));
        failCount += 1;
      } else if (n != null && spec.nObj != null && n >= spec.nObj - tolN) {
        specFeedback.push(format(STRINGS.constraint.nObj, spec.label, spec.nObj, n));
      }
    }

    if (spec.abEq != null) {
      if (ab != null && Math.abs(ab - spec.abEq) > tolAb) {
        specFeedback.push(format(STRINGS.constraint.abEq, spec.label, ab, spec.abEq));
        failCount += 1;
      }
    }

    if (spec.psEq != null) {
      if (ps != null && Math.abs(ps - spec.psEq) > tolPs) {
        specFeedback.push(format(STRINGS.constraint.psEq, spec.label, ps, spec.psEq));
        failCount += 1;
      }
    } else if (spec.psMin != null) {
      if (ps != null && ps < spec.psMin - tolPs) {
        specFeedback.push(format(STRINGS.constraint.psMin, spec.label, ps, spec.psMin));
        failCount += 1;
      } else if (ps != null && spec.psObj != null && ps >= spec.psObj - tolPs) {
        specFeedback.push(format(STRINGS.constraint.psObj, spec.label, spec.psObj, ps));
      }
    }

    if (spec.betaEq != null || spec.betaDefault) {
      const fuelAvailable = asNumber(getCell(main, "O18"));
      const fuelCapacity = asNumber(getCell(main, "O15"));
      const targetBeta =
        spec.betaEq != null
          ? spec.betaEq
          : 1 - fuelAvailable / (2 * fuelCapacity);
      if (!Number.isFinite(targetBeta) || !Number.isFinite(beta) || Math.abs(beta - targetBeta) > tolBeta) {
        specFeedback.push(format(STRINGS.constraint.betaEq, spec.label, targetBeta ?? NaN, beta ?? NaN));
        failCount += 1;
      }
    }

    if (spec.cdxEq != null) {
      if (cdx == null || Math.abs(cdx - spec.cdxEq) > tolCdx) {
        specFeedback.push(format(STRINGS.constraint.cdxEq, spec.label, cdx ?? NaN, spec.cdxEq));
        failCount += 1;
      }
    } else if (spec.cdxAllowed) {
      const match =
        Number.isFinite(cdx) && spec.cdxAllowed.some((v) => Math.abs(cdx - v) < tolCdx);
      if (!match) {
        const allowedList = spec.cdxAllowed
          .map((v) => v.toFixed(3).replace(/\.?0+$/, ""))
          .join(", ");
        specFeedback.push(format(STRINGS.constraint.cdxAllowed, spec.label, cdx ?? NaN, allowedList));
        failCount += 1;
      }
    }

    if (spec.distance) {
      const isTakeoff = spec.label === "Takeoff";
      const isLanding = spec.label === "Landing";
      const distCell = isTakeoff ? "X12" : isLanding ? "X13" : null;
      const distValue = distCell ? asNumber(getCell(main, distCell)) : Number.NaN;
      if (distCell && distValue != null && distValue <= spec.distance.objective + tolDist) {
        const msg = isTakeoff ? STRINGS.constraint.takeoffObj : STRINGS.constraint.landingObj;
        specFeedback.push(format(msg, distValue));
      }
    }

    let thisCurveFailed = false;
    if (spec.curveRow != null && Number.isFinite(wsDesign) && Number.isFinite(twDesign)) {
      const twCurve = [];
      for (let col = 11; col <= 31; col += 1) {
        twCurve.push(getCellByIndex(consts, spec.curveRow, col));
      }
      const requiredTW = pchip(wsAxis, twCurve, wsDesign);
      if (requiredTW != null && twDesign < requiredTW) {
        thisCurveFailed = true;
        curveFailures.add(spec.curveLabel ?? spec.label);
        if (spec.label === "Takeoff") {
          curveMessages.push(format(STRINGS.constraint.takeoffCurve, twDesign, requiredTW));
        }
      }
    }

    if (spec.distance && thisCurveFailed) {
      const distanceMsg = spec.label === "Takeoff" ? STRINGS.constraint.takeoffObj : STRINGS.constraint.landingObj;
      const distCell = spec.label === "Takeoff" ? "X12" : "X13";
      const distValue = asNumber(getCell(main, distCell));
      const rendered = format(distanceMsg, distValue ?? NaN);
      const idx = specFeedback.indexOf(rendered);
      if (idx >= 0) specFeedback.splice(idx, 1);
    }

    feedback.push(...specFeedback);
  });

  // Landing W/S limit as a curve-style check
  if (Number.isFinite(wsDesign)) {
    const wsLimitLanding = asNumber(getCell(consts, "L33"));
    if (wsLimitLanding != null && wsDesign > wsLimitLanding) {
      curveFailures.add("Landing");
      curveMessages.push(format(STRINGS.constraint.landingCurve, wsDesign, wsLimitLanding));
    }
  }

  // Curve failure summary
  if (curveFailures.size > 0) {
    const joined = Array.from(curveFailures).join(", ");
    const plural = curveFailures.size > 1 ? "s" : "";
    let message = format(STRINGS.constraint.curveFailure, plural, joined);
    if (curveFailures.size > 6) {
      message += STRINGS.constraint.curveSuffixMany;
    } else {
      message += STRINGS.constraint.curveSuffixFew;
    }
    curveMessages.push(message);
  }

  // Append curve messages
  feedback.push(...curveMessages);

  // Summary and score impact
  if (failCount > 0) {
    feedback.push(STRINGS.constraintSummary);
    delta -= 1;
  }

  return { delta, feedback };
}
