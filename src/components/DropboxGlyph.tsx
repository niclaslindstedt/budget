// Dropbox brand mark: two stacked blue parallelograms in Dropbox's
// brand blue (#0061FF). Inline SVG so it matches the lucide-react
// call shape used everywhere else (`<Icon size={N} aria-hidden
// focusable={false} />`) without pulling in another icon package.

type Props = {
  size?: number;
  className?: string;
};

export function DropboxGlyph({ size = 18, className }: Props) {
  return (
    <svg
      role="img"
      aria-hidden
      focusable={false}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      className={className}
    >
      <path
        fill="#0061FF"
        d="M6 2 0 6l6 4 6-4-6-4Zm12 0-6 4 6 4 6-4-6-4ZM0 14l6 4 6-4-6-4-6 4Zm18-4-6 4 6 4 6-4-6-4ZM6 19l6 4 6-4-6-4-6 4Z"
      />
    </svg>
  );
}
