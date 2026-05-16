export type ColumnType =
  | "date"
  | "description"
  | "amount"
  | "balance"
  | "completed"
  | "category";

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

export type CategoryIcon =
  | "tag"
  | "home"
  | "car"
  | "shopping-bag"
  | "shopping-cart"
  | "utensils"
  | "coffee"
  | "pizza"
  | "heart"
  | "gift"
  | "music"
  | "film"
  | "plane"
  | "briefcase"
  | "graduation-cap"
  | "stethoscope"
  | "pill"
  | "receipt"
  | "banknote"
  | "credit-card"
  | "piggy-bank"
  | "wallet"
  | "zap"
  | "sparkles"
  | "star";

export type Category = {
  id: string;
  name: string;
  color: string;
  icon: CategoryIcon;
};

export type Sheet = {
  id: string;
  name: string;
  columns: Column[];
  rows: Row[];
  openingBalance: number;
};

export type Budget = {
  version: 2;
  sheets: Sheet[];
  activeSheetId: string;
  categories: Category[];
};
