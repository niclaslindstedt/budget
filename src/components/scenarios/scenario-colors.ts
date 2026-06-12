// Chart series colors for the Scenarios page. The LineChart resolves
// colors through CSS custom properties (`useThemeTokens`), so scenarios
// carry no persisted color — each one derives its token from its index
// in the sheet's scenario list. Hue-distinct theme tokens, cycling past
// the end for the unlikely 7th+ scenario.
export const BASELINE_COLOR_VAR = "--muted";

export const SCENARIO_COLOR_VARS = [
  "--accent",
  "--flag",
  "--positive",
  "--path",
  "--pipe",
  "--negative",
] as const;

export function scenarioColorVar(index: number): string {
  return SCENARIO_COLOR_VARS[
    ((index % SCENARIO_COLOR_VARS.length) + SCENARIO_COLOR_VARS.length) %
      SCENARIO_COLOR_VARS.length
  ];
}
