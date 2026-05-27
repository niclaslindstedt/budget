import type { Widen } from "../_widen";

// Chrome around the achievements feature — the star button, the
// unlock toast, and the per-tier guided tour. The per-achievement
// entries live in `./catalog.ts`; splitting them keeps tour copy and
// the long catalog from competing for the same file.

const shell = {
  star: {
    openList: "Achievements",
    unseenOne: "1 new achievement",
    unseenOther: "{n} new achievements",
  },
  unlockModal: {
    titleOne: "Achievement unlocked!",
    titleOther: "{n} achievements unlocked!",
    dismiss: "Awesome!",
  },
  modal: {
    title: "Achievements",
    counter: "{unlocked} of {total} unlocked · {earned} / {max} pts",
    intro:
      "Every feature in the app is an achievement. Do the thing once and it unlocks. Four tiers, from just opened the app to bending it to your situation. Pick whichever tier is next for you.",
    tierPoints: "· {earned} / {max} pts",
    tierMasteredWhen: "Tier mastered when:",
    learnMore: "Learn more",
    locked: "Locked",
    close: "Close",
    tier: {
      beginner: {
        title: "Beginner",
        subtitle: "You just opened the app. What do you do?",
        graduation:
          "Rows go in, they're labelled, you trust they're saved, and you can find your way around without thinking.",
      },
      intermediate: {
        title: "Intermediate",
        subtitle: "You want this to reflect your real finances.",
        graduation:
          "Every sheet maps to a real account, recurring entries cover your fixed costs, and your categories match how you actually think about spending.",
      },
      pro: {
        title: "Pro",
        subtitle: "Stop typing things the bank already knows.",
        graduation:
          "New bank exports import in seconds and label themselves, your data is encrypted on a cloud you control, and you've stopped keeping a separate manual copy on the side.",
      },
      expert: {
        title: "Expert",
        subtitle: "Bend the app to your exact situation.",
        graduation:
          "The app does what you want, not what its defaults assumed.",
      },
    },
  },
} as const;

export type AchievementsShellCatalog = Widen<typeof shell>;

export default shell;
