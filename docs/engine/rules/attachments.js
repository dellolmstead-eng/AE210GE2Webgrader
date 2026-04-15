import { STRINGS } from "../messages.js";
import { getCell, getCellByIndex, asNumber } from "../parseUtils.js";
import { format } from "../format.js";

const DEG_TO_RAD = Math.PI / 180;

export function runAttachmentChecks(workbook) {
  const feedback = [];
  let failures = 0;
  let stealthIssues = 0;
  let disconnected = 0;

  const main = workbook.sheets.main;
  const geom = workbook.sheets.geom;

  const fuselageLength = asNumber(getCell(main, "B32"));
  const pcsArea = asNumber(getCell(main, "C18"));
  const pcsX = asNumber(getCell(main, "C23"));
  const pcsRootChord = asNumber(getCell(geom, "C8"));
  let vtMountedOff = false;
  if (
    pcsArea != null &&
    pcsArea >= 1 &&
    pcsX != null &&
    pcsRootChord != null &&
    fuselageLength != null &&
    pcsX > fuselageLength - 0.25 * pcsRootChord
  ) {
    feedback.push(STRINGS.attachment.pcsX);
    disconnected += 1;
  }

  const vtArea = asNumber(getCell(main, "H18"));
  const vtX = asNumber(getCell(main, "H23"));
  const vtRootChord = asNumber(getCell(geom, "C10"));
  if (
    vtArea != null &&
    vtArea >= 1 &&
    vtX != null &&
    vtRootChord != null &&
    fuselageLength != null &&
    vtX > fuselageLength - 0.25 * vtRootChord
  ) {
    feedback.push(STRINGS.attachment.vtX);
    disconnected += 1;
  }

  const pcsZ = asNumber(getCell(main, "C25"));
  const fuseZCenter = asNumber(getCell(main, "D52"));
  const fuseZHeight = asNumber(getCell(main, "F52"));
  if (
    pcsArea != null &&
    pcsArea >= 1 &&
    pcsZ != null &&
    fuseZCenter != null &&
    fuseZHeight != null &&
    (pcsZ < fuseZCenter - fuseZHeight / 2 || pcsZ > fuseZCenter + fuseZHeight / 2)
  ) {
    feedback.push(STRINGS.attachment.pcsZ);
    disconnected += 1;
  }

  const vtY = asNumber(getCell(main, "H24"));
  const fuseWidth = asNumber(getCell(main, "E52"));
  if (vtArea != null && vtArea >= 1 && Number.isFinite(vtY) && Number.isFinite(fuseWidth)) {
    if (Math.abs(vtY) > fuseWidth / 2) {
      vtMountedOff = true;
      feedback.push(STRINGS.attachment.vtWing);
    }
  }

  const strakeArea = asNumber(getCell(main, "D18"));
  if (strakeArea != null && strakeArea >= 1) {
    const sweep = asNumber(getCell(geom, "K15"));
    const y = asNumber(getCell(geom, "M152"));
    const strake = asNumber(getCell(geom, "L155"));
    const apex = asNumber(getCell(geom, "L38"));
    if (
      sweep != null &&
      y != null &&
      strake != null &&
      apex != null
    ) {
      const wing = y / Math.tan((90 - sweep) * DEG_TO_RAD) + apex;
      if (!(wing < strake + 0.5)) {
        feedback.push(STRINGS.attachment.strake);
        disconnected += 1;
      }
    }
  }

  if (fuselageLength != null) {
    const activeComponentPositions = [];
    for (let col = 2; col <= 8; col += 1) {
      const area = asNumber(getCellByIndex(main, 18, col));
      const position = asNumber(getCellByIndex(main, 23, col));
      if (area != null && area >= 1 && position != null) {
        activeComponentPositions.push(position);
      }
    }
    if (activeComponentPositions.length > 0) {
      const hasBehind = activeComponentPositions.some((value) => value >= fuselageLength);
      if (hasBehind) {
        feedback.push(format(STRINGS.attachment.fuselage, fuselageLength));
        failures += 1;
      }
    }
  }

  if (disconnected > 0) {
    failures += 1;
  }

  // Aspect ratio checks
  const wingAR = asNumber(getCell(main, "B19"));
  const pcsAR = asNumber(getCell(main, "C19"));
  const vtAR = asNumber(getCell(main, "H19"));
  if (Number.isFinite(wingAR) && Number.isFinite(pcsAR) && pcsAR > wingAR + 0.1) {
    feedback.push(format(STRINGS.attachment.pcsAR, pcsAR, wingAR));
    failures += 1;
  }
  if (Number.isFinite(wingAR) && Number.isFinite(vtAR) && vtAR >= wingAR - 0.1) {
    feedback.push(format(STRINGS.attachment.vtAR, vtAR, wingAR));
    failures += 1;
  }

  const engineDiameter = asNumber(getCell(main, "H29"));
  const inletX = asNumber(getCell(main, "F31"));
  const compressorX = asNumber(getCell(main, "F32"));
  const engineLength = asNumber(getCell(main, "I29"));

  // Vertical tail overlap check when mounted off fuselage
  if (vtMountedOff) {
    const vtApexX = asNumber(getCell(geom, "L163"));
    const vtRootTeX = asNumber(getCell(geom, "L166"));
    const wingTeX = asNumber(getCell(geom, "L41"));
    if (Number.isFinite(vtApexX) && Number.isFinite(vtRootTeX) && Number.isFinite(wingTeX)) {
      const chord = vtRootTeX - vtApexX;
      const overlap = Math.max(0, Math.min(wingTeX, vtRootTeX) - vtApexX);
      if (!(chord > 0) || overlap < 0.8 * chord) {
        feedback.push(STRINGS.attachment.vtOverlap);
        failures += 1;
      }
    } else {
      feedback.push(STRINGS.attachment.vtOverlapMissing);
      failures += 1;
    }
  }

  // Engine width clearance and overhangs
  const engineStart = Number.isFinite(inletX) && Number.isFinite(compressorX) ? inletX + compressorX : Number.NaN;
  const widthSamples = [];
  if (Number.isFinite(engineStart)) {
    for (let row = 34; row <= 53; row += 1) {
      const stationX = asNumber(getCellByIndex(main, row, 2));
      const width = asNumber(getCellByIndex(main, row, 5));
      if (Number.isFinite(stationX) && Number.isFinite(width) && stationX >= engineStart) {
        widthSamples.push(width);
      }
    }
  }
  if (widthSamples.length === 0 || !Number.isFinite(engineDiameter)) {
    feedback.push(STRINGS.attachment.engineWidthMissing);
    failures += 1;
  } else {
    const minWidth = Math.min(...widthSamples);
    const maxWidth = Math.max(...widthSamples);
    const requiredWidth = engineDiameter + 0.5;
    if (minWidth < requiredWidth) {
      feedback.push(format(STRINGS.attachment.engineWidth, minWidth, requiredWidth));
      // Advisory only; no point deduction
    }
    if (Number.isFinite(fuselageLength)) {
      const allowedOverhang = 2.5 * maxWidth;
      const pcsTipX = Math.max(
        asNumber(getCell(geom, "L117")),
        asNumber(getCell(geom, "L118"))
      );
      const vtTipX = Math.max(
        asNumber(getCell(geom, "L165")),
        asNumber(getCell(geom, "L166"))
      );
      if (Number.isFinite(pcsTipX)) {
        const overhang = pcsTipX - fuselageLength;
        if (overhang > allowedOverhang) {
          feedback.push(format(STRINGS.attachment.pcsOverhang, overhang, allowedOverhang));
          // Advisory only; no point deduction
        }
      }
      if (Number.isFinite(vtTipX)) {
        const overhang = vtTipX - fuselageLength;
        if (overhang > allowedOverhang) {
          feedback.push(format(STRINGS.attachment.vtOverhang, overhang, allowedOverhang));
          // Advisory only; no point deduction
        }
      }
    }
  }

  if (
    !Number.isFinite(engineDiameter) ||
    !Number.isFinite(fuselageLength) ||
    !Number.isFinite(inletX) ||
    !Number.isFinite(compressorX) ||
    !Number.isFinite(engineLength)
  ) {
    feedback.push(STRINGS.attachment.engineProtrusionMissing);
    failures += 1;
  } else {
    const protrusion = inletX + compressorX + engineLength - fuselageLength;
    if (protrusion > engineDiameter) {
      feedback.push(format(STRINGS.attachment.engineProtrusion, protrusion, engineDiameter));
      failures += 1;
    }
  }

  // Stealth shaping checks (angle alignment)
  const stealthStart = feedback.length;
  const STEALTH_TOL = 5;
  const wingLeading = edgeAngle(geom, 38, 39);
  const wingTrailing = wingTrailingPlanformAngle(geom);
  const wingTipTE = geomPlanformPoint(geom, 40);
  const wingCenterTE = geomPlanformPoint(geom, 41);
  const pcsLeading = edgeAngle(geom, 115, 116);
  const pcsTipTE = geomPlanformPoint(geom, 117);
  const pcsInnerTE = geomPlanformPoint(geom, 118);
  const pcsTrailing = pcsTrailingPlanformAngle(geom);
  const strakeLeading = edgeAngle(geom, 152, 153);
  const strakeTrailing = edgeAngle(geom, 154, 155);
  const vtLeading = edgeAngle(geom, 163, 164);
  const vtTipTE = geomPlanformPoint(geom, 165);
  const vtInnerTE = geomPlanformPoint(geom, 166);
  const vtTrailing = edgeAngle(geom, 165, 166);
  const pcsDihedral = asNumber(getCell(main, "C26"));
  const vtTilt = asNumber(getCell(main, "H27"));
  const vtZ = asNumber(getCell(main, "H25"));
  const wingArea = asNumber(getCell(main, "B18"));
  const pcsArea2 = asNumber(getCell(main, "C18"));
  const strakeArea2 = asNumber(getCell(main, "D18"));
  const vtArea2 = asNumber(getCell(main, "H18"));
  const pcsActive = Number.isFinite(pcsArea2) && pcsArea2 >= 1;
  const strakeActive = Number.isFinite(strakeArea2) && strakeArea2 >= 1;
  const vtActive = Number.isFinite(vtArea2) && vtArea2 >= 1;
  const wingActive = (Number.isNaN(wingArea) || wingArea >= 1) && !Number.isNaN(wingLeading);

  if (wingActive) {
    if (!Number.isNaN(pcsLeading) && pcsActive) {
      if (!anglesParallel(pcsLeading, wingLeading, STEALTH_TOL)) {
        feedback.push(format(STRINGS.attachment.pcsSweepMatch, Math.abs(pcsLeading), Math.abs(wingLeading), STEALTH_TOL));
        stealthIssues += 1;
      }
    } else if (pcsActive) {
      feedback.push(STRINGS.attachment.stealthMissing);
      stealthIssues += 1;
    }

  const wingTrailingAligned = anglesParallel(wingTrailing, wingLeading, STEALTH_TOL);
  const wingNormalHitsCenterline = teNormalHitsCenterline(wingTipTE, wingCenterTE);
  const isWithinFuselageHeight = (componentZ) =>
    Number.isFinite(componentZ) &&
    Number.isFinite(fuseZCenter) &&
    Number.isFinite(fuseZHeight) &&
    componentZ >= fuseZCenter - fuseZHeight / 2 &&
    componentZ <= fuseZCenter + fuseZHeight / 2;
  if (!Number.isNaN(wingTrailing) && !(wingTrailingAligned || wingNormalHitsCenterline)) {
    feedback.push(format(STRINGS.attachment.wingTrailing, Math.abs(wingTrailing), STEALTH_TOL));
    stealthIssues += 1;
  }

    if (!Number.isNaN(pcsDihedral) && pcsDihedral > 5 && pcsActive) {
      if (!Number.isNaN(pcsLeading) && !anglesParallel(pcsLeading, wingLeading, STEALTH_TOL)) {
        feedback.push(format(STRINGS.attachment.pcsSweepParallel, pcsLeading, wingLeading, STEALTH_TOL));
        stealthIssues += 1;
      }
      const pcsTrailingAligned = !Number.isNaN(pcsTrailing) && anglesParallel(pcsTrailing, wingLeading, STEALTH_TOL);
      const pcsShielded = isWithinFuselageHeight(pcsZ) && teNormalHitsCenterline(pcsTipTE, pcsInnerTE);
      if (!Number.isNaN(pcsTrailing) && !(pcsTrailingAligned || pcsShielded)) {
        feedback.push(format(STRINGS.attachment.pcsTrailParallel, pcsTrailing, wingLeading, STEALTH_TOL));
        stealthIssues += 1;
      }
    }

    if (!Number.isNaN(strakeLeading) && strakeActive) {
      if (!anglesParallel(strakeLeading, wingLeading, STEALTH_TOL)) {
        feedback.push(format(STRINGS.attachment.strakeLead, Math.abs(strakeLeading), Math.abs(wingLeading), STEALTH_TOL));
        stealthIssues += 1;
      }
    }
    if (!Number.isNaN(strakeTrailing) && strakeActive) {
      if (!anglesParallel(strakeTrailing, wingLeading, STEALTH_TOL)) {
        feedback.push(format(STRINGS.attachment.strakeTrail, Math.abs(strakeTrailing), Math.abs(wingLeading), STEALTH_TOL));
        stealthIssues += 1;
      }
    }

    if (!Number.isNaN(vtTilt) && vtTilt < 85 && vtActive) {
      if (!Number.isNaN(vtLeading) && !anglesParallel(vtLeading, wingLeading, STEALTH_TOL)) {
        feedback.push(format(STRINGS.attachment.vtLead, Math.abs(vtLeading), Math.abs(wingLeading), STEALTH_TOL));
        stealthIssues += 1;
      }
      const vtTrailingAligned = !Number.isNaN(vtTrailing) && anglesParallel(vtTrailing, wingLeading, STEALTH_TOL);
      const vtShielded = isWithinFuselageHeight(vtZ) && teNormalHitsCenterline(vtTipTE, vtInnerTE);
      if (!Number.isNaN(vtTrailing) && !(vtTrailingAligned || vtShielded)) {
        feedback.push(format(STRINGS.attachment.vtTrail, Math.abs(vtTrailing), Math.abs(wingLeading), STEALTH_TOL));
        stealthIssues += 1;
      }
    } else if (vtActive && Number.isNaN(vtTilt)) {
      feedback.push(STRINGS.attachment.stealthMissing);
      stealthIssues += 1;
    }
  } else if (pcsActive || strakeActive || vtActive) {
    feedback.push(STRINGS.attachment.stealthMissing);
    stealthIssues += 1;
  }

  if (feedback.length > stealthStart) {
    feedback.splice(stealthStart, 0, "Stealth shaping violations:");
  }

  // Single deduction for geometry/attachment issues (stealth folded into the same point)
  const delta = disconnected > 0 || failures > 0 || stealthIssues > 0 ? -1 : 0;
  if (delta < 0 && !feedback.includes(STRINGS.attachment.deduction)) {
    feedback.push(STRINGS.attachment.deduction);
  }

  return { delta, feedback };
}

function edgeAngle(geom, rowStart, rowEnd) {
  const x1 = asNumber(getCellByIndex(geom, rowStart, 12));
  const y1 = asNumber(getCellByIndex(geom, rowStart, 13));
  const x2 = asNumber(getCellByIndex(geom, rowEnd, 12));
  const y2 = asNumber(getCellByIndex(geom, rowEnd, 13));
  if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
    return Number.NaN;
  }
  const dx = Math.abs(x2 - x1);
  const dy = Math.abs(y2 - y1);
  if (dx === 0 && dy === 0) {
    return 0;
  }
  const angle = Math.atan2(dy, dx) * (180 / Math.PI);
  return angle;
}

function wingTrailingPlanformAngle(geom) {
  const xA = asNumber(getCell(geom, "L40"));
  const xB = asNumber(getCell(geom, "L41"));
  const halfSpan = asNumber(getCell(geom, "N44"));
  if (!Number.isFinite(xA) || !Number.isFinite(xB) || !Number.isFinite(halfSpan)) {
    return Number.NaN;
  }
  const dx = Math.abs(xA - xB);
  const dy = Math.abs(halfSpan);
  if (dx === 0 && dy === 0) {
    return 0;
  }
  return Math.atan2(dx, dy) * (180 / Math.PI);
}

function pcsTrailingPlanformAngle(geom) {
  const xA = asNumber(getCell(geom, "L117"));
  const xB = asNumber(getCell(geom, "L118"));
  const halfSpan = asNumber(getCell(geom, "N121"));
  if (!Number.isFinite(xA) || !Number.isFinite(xB) || !Number.isFinite(halfSpan)) {
    return Number.NaN;
  }
  const dx = Math.abs(xA - xB);
  const dy = Math.abs(halfSpan);
  if (dx === 0 && dy === 0) {
    return 0;
  }
  return Math.atan2(dx, dy) * (180 / Math.PI);
}

function geomPlanformPoint(geom, row) {
  const x = asNumber(getCellByIndex(geom, row, 12));
  const yCandidates = [
    asNumber(getCellByIndex(geom, row, 13)),
    asNumber(getCellByIndex(geom, row, 14)),
  ].filter((value) => Number.isFinite(value));
  const y = yCandidates.length === 0 ? 0 : Math.max(...yCandidates.map((value) => Math.abs(value)));
  return [x, y];
}

function teNormalHitsCenterline(tipPoint, innerPoint) {
  if (!tipPoint.every(Number.isFinite) || !innerPoint.every(Number.isFinite)) {
    return false;
  }
  const dir = [innerPoint[0] - tipPoint[0], innerPoint[1] - tipPoint[1]];
  const normals = [
    [dir[1], -dir[0]],
    [-dir[1], dir[0]],
  ];
  for (const normal of normals) {
    const ny = normal[1];
    if (Math.abs(ny) < 1e-6) {
      continue;
    }
    const t = -tipPoint[1] / ny;
    if (t > 0) {
      return true;
    }
  }
  return false;
}

function anglesParallel(a, b, tol) {
  if (Number.isNaN(a) || Number.isNaN(b)) {
    return false;
  }
  const normalize = (ang) => {
    const mod = ang % 180;
    return mod < 0 ? mod + 180 : mod;
  };
  const aNorm = normalize(a);
  const bNorm = normalize(b);
  const diff = Math.abs(aNorm - bNorm);
  const alt = 180 - diff;
  return diff <= tol || alt <= tol;
}
