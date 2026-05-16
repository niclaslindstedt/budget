export type ColumnType =
  | "date"
  | "description"
  | "amount"
  | "balance"
  | "completed";

export type CellValue = string | number | boolean | null;

export type Column = {
  id: string;
  type: ColumnType;
  label: string;
};

export type Row = {
  id: string;
  cells: Record<string, CellValue>;
};

export type Sheet = {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
  openingBalance: number;
};

export type Budget = {
  version: 1;
  sheets: Sheet[];
  activeSheetId: string;
};
