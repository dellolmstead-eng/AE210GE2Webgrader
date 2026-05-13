function getXlsx() {
  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    throw new Error("Spreadsheet library failed to load. Refresh the page and try again.");
  }
  return xlsx;
}

export function ensureMatrix(sheet) {
  const XLSX = getXlsx();
  const range = XLSX.utils.decode_range(sheet["!ref"] || "A1");
  const rows = range.e.r + 1;
  const cols = range.e.c + 1;
  const matrix = Array.from({ length: rows }, () =>
    Array.from({ length: cols }, () => null)
  );
  Object.keys(sheet).forEach((key) => {
    if (key[0] === "!") {
      return;
    }
    const cell = sheet[key];
    const { r, c } = XLSX.utils.decode_cell(key);
    matrix[r][c] = normalize(cell);
  });
  return matrix;
}

function normalize(cell) {
  if (!cell) {
    return null;
  }
  // Treat Excel error strings as null so downstream checks can handle them
  if (typeof cell.v === "string" && /^#(DIV\/0!|VALUE!|REF!|NAME\?|NUM!|NULL!|N\/A)$/i.test(cell.v.trim())) {
    return null;
  }
  if (typeof cell.v === "number") {
    return cell.v;
  }
  if (typeof cell.v === "string") {
    const trimmed = cell.v.trim();
    const numeric = Number(trimmed);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }
    return trimmed;
  }
  return cell.v ?? null;
}

export function getCell(matrix, ref) {
  const XLSX = getXlsx();
  const { r, c } = XLSX.utils.decode_cell(ref);
  if (!matrix[r]) {
    return null;
  }
  return matrix[r][c] ?? null;
}

export function getCellByIndex(matrix, row1, col1) {
  const r = row1 - 1;
  const c = col1 - 1;
  if (!matrix[r]) {
    return null;
  }
  return matrix[r][c] ?? null;
}

export function asNumber(value) {
  if (value == null) {
    return Number.NaN;
  }
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string") {
    const numeric = Number(value.trim());
    return Number.isNaN(numeric) ? Number.NaN : numeric;
  }
  if (typeof value === "boolean") {
    return value ? 1 : 0;
  }
  return Number(value);
}

export function nearest(value, decimals = 3) {
  if (value == null || Number.isNaN(value)) {
    return value;
  }
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
