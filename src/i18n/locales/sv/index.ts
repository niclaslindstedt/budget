// Composed Swedish catalog. Each per-namespace file is already typed
// against its English counterpart; the top-level `: Catalog`
// annotation here is the belt-and-braces safety net against an
// accidentally-dropped namespace annotation.

import type { Catalog } from "../en/index";
import common from "./common";
import calc from "./calc";
import cloudLink from "./cloudLink";
import pwa from "./pwa";
import app from "./app";
import units from "./units";
import language from "./language";
import validation from "./validation";
import months from "./months";
import weekday from "./weekday";
import auth from "./auth";
import userMenu from "./userMenu";
import headerMenu from "./headerMenu";
import backend from "./backend";
import settings from "./settings";
import sheetTabs from "./sheetTabs";
import sheet from "./sheet";
import budget from "./budget";
import cell from "./cell";
import addRow from "./addRow";
import modal from "./modal";
import confirm from "./confirm";
import bulkBar from "./bulkBar";
import bulkEdit from "./bulkEdit";
import moveCopy from "./moveCopy";
import editEntry from "./editEntry";
import editRow from "./editRow";
import splitRow from "./splitRow";
import editHistory from "./editHistory";
import metadata from "./metadata";
import history from "./history";
import search from "./search";
import searchTransaction from "./searchTransaction";
import actionHistory from "./actionHistory";
import toast from "./toast";
import importHistory from "./importHistory";
import reconciliation from "./reconciliation";
import renamePredictor from "./renamePredictor";
import conflicts from "./conflicts";
import matchRule from "./matchRule";
import recurring from "./recurring";
import recurrenceForm from "./recurrenceForm";
import complex from "./complex";
import transferCollapse from "./transferCollapse";
import transfer from "./transfer";
import coverTransfer from "./coverTransfer";
import account from "./account";
import accountsSheet from "./accountsSheet";
import itemsSheet from "./itemsSheet";
import savingsSheet from "./savingsSheet";
import loansSheet from "./loansSheet";
import insightsSheet from "./insightsSheet";
import investment from "./investment";
import scenarios from "./scenarios";
import salary from "./salary";
import properties from "./properties";
import tax from "./tax";
import cutHistory from "./cutHistory";
import sheetModal from "./sheetModal";
import category from "./category";
import type from "./type";
import company from "./company";
import companyCategory from "./companyCategory";
import tag from "./tag";
import items from "./items";
import glyph from "./glyph";
import color from "./color";
import charts from "./charts";
import datePicker from "./datePicker";
import formula from "./formula";
import updateBalance from "./updateBalance";
import importExport from "./importExport";
import cloudBackup from "./cloudBackup";
import sync from "./sync";
import saveState from "./saveState";
import achievements from "./achievements";
import changelog from "./changelog";
import privacy from "./privacy";
import applySeries from "./applySeries";
import presetCategories from "./presetCategories";
import presetCompanyCategories from "./presetCompanyCategories";
import presetTypes from "./presetTypes";
import download from "./download";
import attachment from "./attachment";
import valueImport from "./valueImport";

export const sv: Catalog = {
  common,
  calc,
  cloudLink,
  pwa,
  app,
  units,
  language,
  validation,
  months,
  weekday,
  auth,
  userMenu,
  headerMenu,
  backend,
  settings,
  sheetTabs,
  sheet,
  budget,
  cell,
  addRow,
  modal,
  confirm,
  bulkBar,
  bulkEdit,
  moveCopy,
  editEntry,
  editRow,
  splitRow,
  editHistory,
  metadata,
  history,
  search,
  searchTransaction,
  actionHistory,
  toast,
  importHistory,
  reconciliation,
  renamePredictor,
  conflicts,
  matchRule,
  recurring,
  recurrenceForm,
  complex,
  transferCollapse,
  transfer,
  coverTransfer,
  account,
  accountsSheet,
  itemsSheet,
  savingsSheet,
  loansSheet,
  insightsSheet,
  investment,
  scenarios,
  salary,
  properties,
  tax,
  cutHistory,
  sheetModal,
  category,
  type,
  company,
  companyCategory,
  tag,
  items,
  glyph,
  color,
  charts,
  datePicker,
  formula,
  updateBalance,
  importExport,
  cloudBackup,
  sync,
  saveState,
  achievements,
  changelog,
  privacy,
  applySeries,
  presetCategories,
  presetCompanyCategories,
  presetTypes,
  download,
  attachment,
  valueImport,
};
