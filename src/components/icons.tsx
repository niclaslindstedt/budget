import type { ColumnType } from "../data/types";

type IconProps = { size?: number; className?: string };

function svgProps(size: number) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none" as const,
    stroke: "currentColor",
    strokeWidth: 2,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
    focusable: false,
  };
}

export function IconCalendar({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4M8 2v4M3 10h18" />
    </svg>
  );
}

export function IconText({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M4 6h16M4 12h16M4 18h10" />
    </svg>
  );
}

export function IconAmount({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 2v20" />
      <path d="M17 6H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
    </svg>
  );
}

export function IconBalance({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 3v18" />
      <path d="M3 7h18" />
      <path d="M6 7l-3 6a3 3 0 0 0 6 0z" />
      <path d="M18 7l-3 6a3 3 0 0 0 6 0z" />
    </svg>
  );
}

export function IconCheck({ size = 16, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

export function IconTrash({ size = 18, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M3 6h18" />
      <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function IconPlus({ size = 22, className }: IconProps) {
  return (
    <svg {...svgProps(size)} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function ColumnIcon({
  type,
  size,
  className,
}: {
  type: ColumnType;
  size?: number;
  className?: string;
}) {
  switch (type) {
    case "date":
      return <IconCalendar size={size} className={className} />;
    case "description":
      return <IconText size={size} className={className} />;
    case "amount":
      return <IconAmount size={size} className={className} />;
    case "balance":
      return <IconBalance size={size} className={className} />;
    case "completed":
      return <IconCheck size={size} className={className} />;
  }
}
