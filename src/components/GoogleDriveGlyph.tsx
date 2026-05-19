// Google Drive brand mark: a triangle split into three coloured
// segments — blue parallelogram on the left, yellow on top right,
// green strip across the bottom. Inline SVG so it matches the
// lucide-react call shape used everywhere else
// (`<Icon size={N} aria-hidden focusable={false} />`) without
// pulling in another icon package.

type Props = {
  size?: number;
  className?: string;
};

export function GoogleDriveGlyph({ size = 18, className }: Props) {
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
      <path fill="#1967D2" d="m8 2-8 14 4 6 8-14L8 2Z" />
      <path fill="#FBC02D" d="M16 2H8l8 14h8L16 2Z" />
      <path fill="#34A853" d="M6 18l-2 4h16l2-4H6Z" />
    </svg>
  );
}
