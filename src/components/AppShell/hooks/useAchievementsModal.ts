import { useState } from "react";

type Result = {
  // Unlock-notification modal. Opens when the HeaderStar is clicked
  // and the user has unseen achievements to acknowledge.
  achievementsModalOpen: boolean;
  setAchievementsModalOpen: (open: boolean) => void;
  // Full achievements-list modal — the guided tour with every tier.
  achievementsListOpen: boolean;
  setAchievementsListOpen: (open: boolean) => void;
};

export function useAchievementsModal(): Result {
  const [achievementsModalOpen, setAchievementsModalOpen] = useState(false);
  const [achievementsListOpen, setAchievementsListOpen] = useState(false);
  return {
    achievementsModalOpen,
    setAchievementsModalOpen,
    achievementsListOpen,
    setAchievementsListOpen,
  };
}
