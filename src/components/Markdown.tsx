import { Fragment, type ReactNode } from "react";

import {
  type Block,
  FEATURE_LINK_SCHEME,
  type Inline,
  parseMarkdown,
} from "./markdown";

// Renderer for the markdown AST produced by `./markdown`. Every colour,
// radius, and border reads through a theme token so the output follows the
// active One Dark / One Light (or Custom) theme. See `./markdown` for the
// supported grammar and the `feature:<slug>` link convention.

type RenderCtx = { onOpenFeature?: (slug: string) => void };

function renderInline(
  nodes: Inline[],
  ctx: RenderCtx,
  keyBase: string,
): ReactNode {
  return nodes.map((node, idx) => {
    const key = `${keyBase}-${idx}`;
    switch (node.type) {
      case "text":
        return <Fragment key={key}>{node.value}</Fragment>;
      case "bold":
        return (
          <strong key={key} className="font-bold text-fg-bright">
            {renderInline(node.children, ctx, key)}
          </strong>
        );
      case "italic":
        return (
          <em key={key} className="italic">
            {renderInline(node.children, ctx, key)}
          </em>
        );
      case "code":
        return (
          <code
            key={key}
            className="rounded-sm bg-surface-2 px-1 py-0.5 text-xs text-path"
          >
            {node.value}
          </code>
        );
      case "link": {
        if (node.href.startsWith(FEATURE_LINK_SCHEME)) {
          const slug = node.href.slice(FEATURE_LINK_SCHEME.length);
          return (
            <button
              key={key}
              type="button"
              onClick={() => ctx.onOpenFeature?.(slug)}
              className="cursor-pointer text-link hover:underline"
            >
              {renderInline(node.children, ctx, key)}
            </button>
          );
        }
        return (
          <a
            key={key}
            href={node.href}
            target="_blank"
            rel="noreferrer noopener"
            className="text-link hover:underline"
          >
            {renderInline(node.children, ctx, key)}
          </a>
        );
      }
    }
  });
}

const HEADING_CLASS: Record<number, string> = {
  1: "mt-2 text-base font-bold text-fg-bright",
  2: "mt-3 text-sm font-bold tracking-wide text-fg-bright",
  3: "mt-2 text-sm font-bold text-fg-bright",
  4: "mt-2 text-xs font-bold tracking-wide text-fg",
  5: "mt-2 text-xs font-bold text-fg",
  6: "mt-2 text-xs font-bold text-muted",
};

function renderBlock(block: Block, ctx: RenderCtx, key: string): ReactNode {
  switch (block.type) {
    case "heading": {
      const Tag = `h${block.level}` as keyof React.JSX.IntrinsicElements;
      return (
        <Tag key={key} className={HEADING_CLASS[block.level]}>
          {renderInline(block.children, ctx, key)}
        </Tag>
      );
    }
    case "paragraph":
      return (
        <p key={key} className="text-fg">
          {renderInline(block.children, ctx, key)}
        </p>
      );
    case "list": {
      const cls = block.ordered ? "list-decimal" : "list-disc";
      const items = block.items.map((item, idx) => (
        <li key={`${key}-${idx}`}>
          {renderInline(item, ctx, `${key}-${idx}`)}
        </li>
      ));
      return block.ordered ? (
        <ol key={key} className={`ml-5 ${cls} space-y-1 text-fg`}>
          {items}
        </ol>
      ) : (
        <ul key={key} className={`ml-5 ${cls} space-y-1 text-fg`}>
          {items}
        </ul>
      );
    }
    case "blockquote":
      return (
        <blockquote
          key={key}
          className="border-l-2 border-line pl-3 text-muted italic"
        >
          {renderInline(block.children, ctx, key)}
        </blockquote>
      );
    case "code":
      return (
        <pre
          key={key}
          className="overflow-x-auto rounded-sm bg-surface-2 p-3 text-xs text-path"
        >
          <code>{block.value}</code>
        </pre>
      );
  }
}

type Props = {
  source: string;
  // Called when a `feature:<slug>` link is activated. When omitted, such
  // links render as inert buttons (the slug has nowhere to go).
  onOpenFeature?: (slug: string) => void;
  className?: string;
};

export function Markdown({ source, onOpenFeature, className }: Props) {
  const blocks = parseMarkdown(source);
  const ctx: RenderCtx = { onOpenFeature };
  return (
    <div className={`flex flex-col gap-3 ${className ?? ""}`.trim()}>
      {blocks.map((block, idx) => renderBlock(block, ctx, `b-${idx}`))}
    </div>
  );
}
