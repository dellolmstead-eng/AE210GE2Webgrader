import { ensureMatrix } from "./parseUtils.js";

function getXlsx() {
  const xlsx = globalThis.XLSX;
  if (!xlsx) {
    throw new Error("Spreadsheet library failed to load. Refresh the page and try again.");
  }
  return xlsx;
}

async function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

function extractSheet(workbook, sheetName, fallbackCells) {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    throw new Error(`Required sheet "${sheetName}" is missing.`);
  }
  const matrix = ensureMatrix(sheet);

  // Patch fallback cells if the matrix is missing or NaN
  if (fallbackCells && fallbackCells.length > 0) {
    fallbackCells.forEach((cellRef) => {
      const cell = sheet[cellRef];
      if (!cell) {
        return;
      }
      const { row, col } = cellToIndices(cellRef);
      if (matrix[row] && matrix[row][col] == null) {
        matrix[row][col] = normalizeCellValue(cell);
      }
    });
  }
  return matrix;
}

function cellToIndices(ref) {
  const match = ref.match(/^([A-Z]+)(\d+)$/i);
  if (!match) {
    throw new Error(`Invalid cell reference: ${ref}`);
  }
  const [, colLetters, rowStr] = match;
  const row = parseInt(rowStr, 10) - 1;
  let col = 0;
  for (let i = 0; i < colLetters.length; i += 1) {
    col = col * 26 + (colLetters.charCodeAt(i) - 64);
  }
  return { row, col: col - 1 };
}

function normalizeCellValue(cell) {
  if (!cell) {
    return null;
  }
  if (cell.v == null) {
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
  return cell.v;
}

export async function loadWorkbook(file, rules) {
  const arrayBuffer = await readFileAsArrayBuffer(file);
  const XLSX = getXlsx();
  const workbook = XLSX.read(arrayBuffer, { type: "array", cellDates: true });

  const sheetData = {
    aero: extractSheet(workbook, "Aero", rules.sheets.Aero.fallbackCells),
    miss: extractSheet(workbook, "Miss", rules.sheets.Miss.fallbackCells),
    main: extractSheet(workbook, "Main", rules.sheets.Main.fallbackCells),
    consts: extractSheet(workbook, "Consts", rules.sheets.Consts.fallbackCells),
    gear: extractSheet(workbook, "Gear", rules.sheets.Gear.fallbackCells),
    geom: extractSheet(workbook, "Geom", rules.sheets.Geom.fallbackCells),
  };

  return {
    sheets: sheetData,
    fileName: file.name,
    versionLabel: rules.versionLabel,
  };
}
