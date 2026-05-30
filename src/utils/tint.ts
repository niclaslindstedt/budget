// Entity-colour tints. A coloured entity (sheet, account, type,
// category, …) renders its swatch as a translucent wash of the user's
// chosen colour: a soft fill behind the content and a stronger border
// around it. The colour itself is dynamic user data so it can't be a
// static CSS class, but the *strengths* (how translucent fill vs.
// border are) read through CSS vars so the Custom-theme surface can
// reach them in one place instead of 30 inline literals.
export function tintFill(color: string): string {
  return `color-mix(in srgb, ${color} var(--tint-fill-strength), transparent)`;
}

export function tintBorder(color: string): string {
  return `color-mix(in srgb, ${color} var(--tint-border-strength), transparent)`;
}
