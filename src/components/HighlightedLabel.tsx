import { matchPrefixRange } from "../utils/highlight";

type Props = {
  // The full label to render.
  text: string;
  // The active type-ahead buffer. When it prefix-matches `text` the
  // matched characters are emphasised; otherwise (or when empty) the
  // text renders untouched, so this is safe to pass unconditionally.
  query: string;
};

// Renders `text` with the leading run that matches `query` wrapped in a
// <mark>, so type-ahead pickers can show which characters the user's
// search just matched. Colour is inherited (the highlight rides on top
// of whatever the surrounding chip / label colour is) and the emphasis
// is bold + underline rather than a fill, keeping it legible against the
// One Dark / One Light surfaces without a hardcoded highlight colour.
export function HighlightedLabel({ text, query }: Props) {
  const range = matchPrefixRange(text, query);
  if (!range) return <>{text}</>;
  return (
    <>
      {text.slice(0, range.start)}
      <mark className="bg-transparent font-bold text-inherit underline underline-offset-2">
        {text.slice(range.start, range.end)}
      </mark>
      {text.slice(range.end)}
    </>
  );
}
