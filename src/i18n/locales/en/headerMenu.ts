import type { Widen } from "./_widen";

const headerMenu = {
  openMenu: "Open menu",
} as const;

export type HeaderMenuCatalog = Widen<typeof headerMenu>;

export default headerMenu;
