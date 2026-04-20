import { STRINGS } from "../messages.js";
import { getCell, getCellByIndex, asNumber } from "../parseUtils.js";
import { format } from "../format.js";

const DEG_TO_RAD = Math.PI / 180;
const CORNER_REFLECTOR_TARGET = 45;
const CORNER_REFLECTOR_TOL = 5;
const CORNER_REFLECTOR_EDGE_TOL = 0.1;
const EDGE_ALIGN_TOL = 0.2;

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
  if (Number.isFinite(pcsArea) && pcsArea >= 1) {
    if (!Number.isFinite(fuselageLength) || !Number.isFinite(pcsX) || !Number.isFinite(pcsRootChord)) {
      feedback.push(STRINGS.attachment.pcsXMissing);
      failures += 1;
    } else if (pcsX > fuselageLength - 0.25 * pcsRootChord) {
      feedback.push(STRINGS.attachment.pcsX);
      disconnected += 1;
    }
  }

  const vtArea = asNumber(getCell(main, "H18"));
  const vtX = asNumber(getCell(main, "H23"));
  const vtRootChord = asNumber(getCell(geom, "C10"));
  if (Number.isFinite(vtArea) && vtArea >= 1) {
    if (!Number.isFinite(fuselageLength) || !Number.isFinite(vtX) || !Number.isFinite(vtRootChord)) {
      feedback.push(STRINGS.attachment.vtXMissing);
      failures += 1;
    } else if (vtX > fuselageLength - 0.25 * vtRootChord) {
      feedback.push(STRINGS.attachment.vtX);
      disconnected += 1;
    }
  }

  const pcsZ = asNumber(getCell(main, "C25"));
  const fuseZCenter = asNumber(getCell(main, "D52"));
  const fuseZHeight = asNumber(getCell(main, "F52"));
  if (Number.isFinite(pcsArea) && pcsArea >= 1) {
    if (!Number.isFinite(pcsZ) || !Number.isFinite(fuseZCenter) || !Number.isFinite(fuseZHeight)) {
      feedback.push(STRINGS.attachment.pcsZMissing);
      failures += 1;
    } else if (pcsZ < fuseZCenter - fuseZHeight / 2 || pcsZ > fuseZCenter + fuseZHeight / 2) {
      feedback.push(STRINGS.attachment.pcsZ);
      disconnected += 1;
    }
  }

  const vtY = asNumber(getCell(main, "H24"));
  const fuseWidth = asNumber(getCell(main, "E52"));
  if (Number.isFinite(vtArea) && vtArea >= 1) {
    if (!Number.isFinite(vtY) || !Number.isFinite(fuseWidth)) {
      feedback.push(STRINGS.attachment.vtYMissing);
      failures += 1;
    } else if (Math.abs(vtY) > fuseWidth / 2) {
      vtMountedOff = true;
      feedback.push(STRINGS.attachment.vtWing);
    }
  }

  const strakeArea = asNumber(getCell(main, "D18"));
  if (Number.isFinite(strakeArea) && strakeArea >= 1) {
    const sweep = asNumber(getCell(geom, "K15"));
    const y = asNumber(getCell(geom, "M152"));
    const strake = asNumber(getCell(geom, "L155"));
    const apex = asNumber(getCell(geom, "L38"));
    if (!Number.isFinite(sweep) || !Number.isFinite(y) || !Number.isFinite(strake) || !Number.isFinite(apex)) {
      feedback.push(STRINGS.attachment.strakeMissing);
      failures += 1;
    } else {
      const wing = y / Math.tan((90 - sweep) * DEG_TO_RAD) + apex;
      if (!(wing < strake + 0.5)) {
        feedback.push(STRINGS.attachment.strake);
        disconnected += 1;
      }
    }
  }

  const wingLeadingRoot = geomPlanformPoint(geom, 38);
  const wingLeadingTip = geomPlanformPoint(geom, 39);
  const wingTrailingRoot = geomPlanformPoint(geom, 41);
  const wingTrailingTip = geomPlanformPoint(geom, 40);

  const elevonArea = asNumber(getCell(main, "E18"));
  if (Number.isFinite(elevonArea) && elevonArea >= 1) {
    const result = checkWingDevicePlacement(
      "Elevon",
      "trailing edge",
      geomPlanformPoint(geom, 177),
      geomPlanformPoint(geom, 176),
      geomPlanformPoint(geom, 174),
      geomPlanformPoint(geom, 175),
      wingLeadingRoot,
      wingLeadingTip,
      wingTrailingRoot,
      wingTrailingTip,
    );
    feedback.push(...result.messages);
    failures += result.failed ? 1 : 0;
  }

  const lefArea = asNumber(getCell(main, "F18"));
  if (Number.isFinite(lefArea) && lefArea >= 1) {
    const result = checkWingDevicePlacement(
      "LE Flap",
      "leading edge",
      geomPlanformPoint(geom, 186),
      geomPlanformPoint(geom, 187),
      geomPlanformPoint(geom, 189),
      geomPlanformPoint(geom, 188),
      wingLeadingRoot,
      wingLeadingTip,
      wingTrailingRoot,
      wingTrailingTip,
    );
    feedback.push(...result.messages);
    failures += result.failed ? 1 : 0;
  }

  const tefArea = asNumber(getCell(main, "G18"));
  if (Number.isFinite(tefArea) && tefArea >= 1) {
    const result = checkWingDevicePlacement(
      "TE Flap",
      "trailing edge",
      geomPlanformPoint(geom, 201),
      geomPlanformPoint(geom, 200),
      geomPlanformPoint(geom, 198),
      geomPlanformPoint(geom, 199),
      wingLeadingRoot,
      wingLeadingTip,
      wingTrailingRoot,
      wingTrailingTip,
    );
    feedback.push(...result.messages);
    failures += result.failed ? 1 : 0;
  }

  if (Number.isFinite(fuselageLength)) {
    const activeComponentPositions = [];
    for (let col = 2; col <= 8; col += 1) {
      const area = asNumber(getCellByIndex(main, 18, col));
      const position = asNumber(getCellByIndex(main, 23, col));
      if (Number.isFinite(area) && area >= 1 && Number.isFinite(position)) {
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
  } else {
    const hasActiveComponent = Array.from({ length: 7 }, (_, offset) =>
      asNumber(getCellByIndex(main, 18, offset + 2))
    ).some((area) => Number.isFinite(area) && area >= 1);
    if (hasActiveComponent) {
      feedback.push(STRINGS.attachment.fuselageMissing);
      failures += 1;
    }
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
      const allowedOverhang = 2 * maxWidth;
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
  const wingDihedral = asNumber(getCell(main, "B26"));
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
  const wingActive = Number.isFinite(wingArea) && wingArea >= 1;
  const checkCornerReflector = (angle, isActive, template) => {
    if (!isActive || Number.isNaN(angle)) {
      return;
    }
    if (Math.abs(angle - CORNER_REFLECTOR_TARGET) < CORNER_REFLECTOR_TOL - CORNER_REFLECTOR_EDGE_TOL) {
      feedback.push(format(template, angle, CORNER_REFLECTOR_TOL, CORNER_REFLECTOR_TOL));
      stealthIssues += 1;
    }
  };

  if (wingActive) {
    checkCornerReflector(wingDihedral, wingActive, STRINGS.attachment.wingCornerReflector);
    checkCornerReflector(pcsDihedral, pcsActive, STRINGS.attachment.pcsCornerReflector);
    checkCornerReflector(vtTilt, vtActive, STRINGS.attachment.vtCornerReflector);
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
  const wingNormalHitsCenterline = teNormalHitsCenterline(wingTipTE, wingCenterTE, fuselageLength);
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
      const pcsShielded =
        isSurfaceWithinFuselageHeight(pcsZ, pcsDihedral, pcsTipTE, pcsInnerTE, fuseZCenter, fuseZHeight) &&
        teNormalHitsCenterline(pcsTipTE, pcsInnerTE, fuselageLength);
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
      const vtShielded =
        isSurfaceWithinFuselageHeight(vtZ, vtTilt, vtTipTE, vtInnerTE, fuseZCenter, fuseZHeight) &&
        teNormalHitsCenterline(vtTipTE, vtInnerTE, fuselageLength);
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
  return edgeAngle(geom, 40, 41);
}

function pcsTrailingPlanformAngle(geom) {
  return edgeAngle(geom, 117, 118);
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

function sortEdgePairsByY(relevantA, relevantB, oppositeA, oppositeB) {
  if (relevantA[1] <= relevantB[1]) {
    return {
      relevantInboard: relevantA,
      relevantOutboard: relevantB,
      oppositeInboard: oppositeA,
      oppositeOutboard: oppositeB,
    };
  }
  return {
    relevantInboard: relevantB,
    relevantOutboard: relevantA,
    oppositeInboard: oppositeB,
    oppositeOutboard: oppositeA,
  };
}

function interpolateEdgeXAtY(pointA, pointB, y) {
  if (!pointA.every(Number.isFinite) || !pointB.every(Number.isFinite) || !Number.isFinite(y)) {
    return { x: Number.NaN, inRange: false };
  }
  const y1 = pointA[1];
  const y2 = pointB[1];
  const lower = Math.min(y1, y2);
  const upper = Math.max(y1, y2);
  if (y < lower - 1e-6 || y > upper + 1e-6) {
    return { x: Number.NaN, inRange: false };
  }
  if (Math.abs(y2 - y1) < 1e-9) {
    return { x: pointA[0], inRange: Math.abs(y - y1) <= 1e-6 };
  }
  const t = (y - y1) / (y2 - y1);
  return { x: pointA[0] + t * (pointB[0] - pointA[0]), inRange: true };
}

function checkWingDevicePlacement(deviceName, edgeName, relevantA, relevantB, oppositeA, oppositeB, wingLeadingRoot, wingLeadingTip, wingTrailingRoot, wingTrailingTip) {
  const points = [relevantA, relevantB, oppositeA, oppositeB, wingLeadingRoot, wingLeadingTip, wingTrailingRoot, wingTrailingTip];
  if (points.some((point) => !point.every(Number.isFinite))) {
    return { failed: true, messages: [format(STRINGS.attachment.wingDeviceMissing, deviceName)] };
  }

  const { relevantInboard, relevantOutboard, oppositeInboard, oppositeOutboard } =
    sortEdgePairsByY(relevantA, relevantB, oppositeA, oppositeB);
  const wingSpan = Math.max(wingLeadingRoot[1], wingLeadingTip[1], wingTrailingRoot[1], wingTrailingTip[1]);
  let spanFail = false;
  let edgeFail = false;
  let envelopeFail = false;

  for (const pair of [
    [relevantInboard, oppositeInboard],
    [relevantOutboard, oppositeOutboard],
  ]) {
    const [relevantPoint, oppositePoint] = pair;
    const y = relevantPoint[1];
    if (y < -EDGE_ALIGN_TOL || y > wingSpan + EDGE_ALIGN_TOL) {
      spanFail = true;
      continue;
    }

    const wingLeading = interpolateEdgeXAtY(wingLeadingRoot, wingLeadingTip, y);
    const wingTrailing = interpolateEdgeXAtY(wingTrailingRoot, wingTrailingTip, y);
    if (!wingLeading.inRange || !wingTrailing.inRange) {
      spanFail = true;
      continue;
    }

    const targetX = edgeName === "leading edge" ? wingLeading.x : wingTrailing.x;
    if (Math.abs(relevantPoint[0] - targetX) > EDGE_ALIGN_TOL) {
      edgeFail = true;
    }

    const lower = Math.min(wingLeading.x, wingTrailing.x) - EDGE_ALIGN_TOL;
    const upper = Math.max(wingLeading.x, wingTrailing.x) + EDGE_ALIGN_TOL;
    if (oppositePoint[0] < lower || oppositePoint[0] > upper) {
      envelopeFail = true;
    }
  }

  const messages = [];
  if (spanFail) {
    messages.push(format(STRINGS.attachment.wingDeviceSpan, deviceName));
  }
  if (edgeFail) {
    messages.push(format(STRINGS.attachment.wingDeviceEdge, deviceName, edgeName, edgeName, EDGE_ALIGN_TOL));
  }
  if (envelopeFail) {
    messages.push(format(STRINGS.attachment.wingDeviceEnvelope, deviceName));
  }
  return { failed: spanFail || edgeFail || envelopeFail, messages };
}

function teNormalHitsCenterline(tipPoint, innerPoint, fuselageLength) {
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
      const x = tipPoint[0] + normal[0] * t;
      if (Number.isFinite(x) && Number.isFinite(fuselageLength) && x >= -1e-6 && x <= fuselageLength + 1e-6) {
        return true;
      }
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

function isSurfaceWithinFuselageHeight(componentZ, dihedralAngle, tipPoint, innerPoint, fuselageCenterZ, fuselageHeight) {
  if (
    !Number.isFinite(componentZ) ||
    !Number.isFinite(dihedralAngle) ||
    !tipPoint.every(Number.isFinite) ||
    !innerPoint.every(Number.isFinite) ||
    !Number.isFinite(fuselageCenterZ) ||
    !Number.isFinite(fuselageHeight)
  ) {
    return false;
  }
  const spanOffset = Math.abs(tipPoint[1] - innerPoint[1]);
  const tipZ = componentZ + spanOffset * Math.tan((dihedralAngle * Math.PI) / 180);
  const lower = fuselageCenterZ - fuselageHeight / 2;
  const upper = fuselageCenterZ + fuselageHeight / 2;
  return componentZ >= lower && componentZ <= upper && tipZ >= lower && tipZ <= upper;
}
