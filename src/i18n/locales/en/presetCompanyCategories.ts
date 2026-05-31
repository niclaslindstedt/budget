import type { Widen } from "./_widen";

const presetCompanyCategories = {
  grocery: "Grocery stores",
  restaurant: "Restaurants",
  cafe: "Cafés",
  "fast-food": "Fast food",
  alcohol: "Alcohol",
  clothing: "Clothing & fashion",
  electronics: "Electronics",
  "home-goods": "Home & furniture",
  hardware: "Hardware & DIY",
  pharmacy: "Pharmacies",
  health: "Health & care",
  fuel: "Fuel & charging",
  transport: "Transport & travel",
  entertainment: "Entertainment & leisure",
  online: "Online retail",
  services: "Services",
  bank: "Banks & finance",
  other: "Other",
} as const;

export type PresetCompanyCategoriesCatalog = Widen<
  typeof presetCompanyCategories
>;

export default presetCompanyCategories;
