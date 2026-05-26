import type { ConflictsCatalog } from "../en/conflicts";

const conflicts: ConflictsCatalog = {
  title: "Hitta dubbletter",
  intro:
    "Par på samma datum, samma kategori, med belopp inom 5% av varandra. Mindre summor och kategorin Mat utesluts.",
  minAmountLabel: "Minsta belopp",
  minAmountHint: "Dölj par som är mindre än så här.",
  empty: "Inga dubbletter hittade.",
  emptyHint: "Sänk minsta belopp för att utvidga sökningen.",
  foodExcludedHint: "Poster i kategorin Mat utesluts från sökningen.",
  winnerBadge: "behåll",
  historyBadge: "bank",
  untypedLabel: "(ingen typ)",
  uncategorizedLabel: "(ingen kategori)",
  merge: "Slå ihop",
  mergeAria: "Slå ihop {n} dubbletter",
  mergedOne: "1 dubblett sammanslagen.",
  mergedOther: "{n} dubbletter sammanslagna.",
  countOne: "{n} dubblett",
  countOther: "{n} dubbletter",
};

export default conflicts;
