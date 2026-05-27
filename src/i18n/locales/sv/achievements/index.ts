import type { AchievementsCatalog } from "../../en/achievements";
import catalog from "./catalog";
import shell from "./shell";

const achievements: AchievementsCatalog = {
  ...shell,
  catalog,
};

export default achievements;
