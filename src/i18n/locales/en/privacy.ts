import type { Widen } from "./_widen";

const privacy = {
  pageTitle: "Privacy policy",
} as const;

export type PrivacyCatalog = Widen<typeof privacy>;

export default privacy;
