export const RULES = {
  versionLabel: "AE210GE2Webgrader v3.2",
  matlabVersion: "GE3_autograde_Olmstead_Fall_2025_v2",
  sheets: {
    Aero: {
      fallbackCells: ["G3", "G4", "G10", "G11", "A15", "A16"],
    },
    Miss: {
      fallbackCells: [
        "C48", "D48", "E48", "F48", "G48", "H48", "I48", "J48", "K48", "L48", "M48", "N48",
        "C49", "D49", "E49", "F49", "G49", "H49", "I49", "J49", "K49", "L49", "M49", "N49",
      ],
    },
    Main: {
      fallbackCells: [
        "T3", "U3", "V3", "W3", "X3", "Y3",
        "T4", "U4", "V4", "W4", "X4", "Y4",
        "T6", "U6", "V6", "W6", "X6", "Y6",
        "T7", "U7", "V7", "W7", "X7", "Y7",
        "T8", "U8", "V8", "W8", "X8", "Y8",
        "T9", "U9", "V9", "W9", "X9", "Y9",
        "AB3", "AB4", "X12", "X13", "Y37",
        "M10", "O10", "P10", "Q10",
        "O18", "X40", "Q23", "Q31", "N31",
        "P13", "Q13",
        "K33", "L33", "M33", "N33", "P33", "R33", "S33", "V33", "W33",
        "K35", "L35", "M35", "N35", "P35", "R35", "S35", "V35", "W35",
        "K36", "L36", "M36", "N36", "P36", "R36", "S36", "V36", "W36",
        "K38", "L38", "M38", "N38", "P38", "R38", "S38", "V38", "W38",
        "K39", "L39", "M39", "N39", "P39", "R39", "S39", "V39", "W39",
        "B32", "C23", "C25", "H23",
        "B27", "C27", "H27",
        "D18", "D23", "D52", "F52",
        "H24", "H25", "E52"
      ],
    },
    Consts: {
      fallbackCells: ["K22", "K23", "K24", "K26", "K27", "K28", "K29", "K32", "AO42", "AQ41", "K33"],
    },
    Gear: {
      fallbackCells: ["J20", "L20", "L21", "M20", "M21", "N20", "N21"],
    },
    Geom: {
      fallbackCells: ["C8", "C10", "M152", "K15", "L155", "L38", "L40", "L41", "N44", "L117", "L118", "N121"],
    },
  },
  macroWarningText: "This sheet has been saved as a .xlsx file which diables the macros in JET and makes Ps graphing impossible. Save as a macro enabled file outside your downloads folder for full functionality.",
};
