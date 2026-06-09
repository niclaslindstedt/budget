import { describe, expect, it } from "vitest";

import {
  FEATURE_LINK_SCHEME,
  parseInline,
  parseMarkdown,
} from "../src/components/markdown";
import { parseFeatureDoc } from "../vite/feature-docs-plugin";

describe("parseInline", () => {
  it("returns a single text run for plain text", () => {
    expect(parseInline("hello world")).toEqual([
      { type: "text", value: "hello world" },
    ]);
  });

  it("parses bold before single-asterisk italic", () => {
    expect(parseInline("**Properties sheet**")).toEqual([
      {
        type: "bold",
        children: [{ type: "text", value: "Properties sheet" }],
      },
    ]);
  });

  it("parses italic with both asterisk and underscore", () => {
    expect(parseInline("an _avgift_ and *more*")).toEqual([
      { type: "text", value: "an " },
      { type: "italic", children: [{ type: "text", value: "avgift" }] },
      { type: "text", value: " and " },
      { type: "italic", children: [{ type: "text", value: "more" }] },
    ]);
  });

  it("parses inline code literally (no markdown inside)", () => {
    expect(parseInline("the `**raw**` token")).toEqual([
      { type: "text", value: "the " },
      { type: "code", value: "**raw**" },
      { type: "text", value: " token" },
    ]);
  });

  it("parses links and preserves the href", () => {
    expect(parseInline("see [the docs](https://example.com)")).toEqual([
      { type: "text", value: "see " },
      {
        type: "link",
        href: "https://example.com",
        children: [{ type: "text", value: "the docs" }],
      },
    ]);
  });

  it("carries the feature: scheme through on a Learn more link", () => {
    const nodes = parseInline("[Learn more](feature:properties)");
    expect(nodes).toHaveLength(1);
    const link = nodes[0];
    expect(link.type).toBe("link");
    if (link.type === "link") {
      expect(link.href.startsWith(FEATURE_LINK_SCHEME)).toBe(true);
      expect(link.href.slice(FEATURE_LINK_SCHEME.length)).toBe("properties");
    }
  });
});

describe("parseMarkdown", () => {
  it("parses an ATX heading at the right level", () => {
    expect(parseMarkdown("## Mortgages")).toEqual([
      {
        type: "heading",
        level: 2,
        children: [{ type: "text", value: "Mortgages" }],
      },
    ]);
  });

  it("groups wrapped lines into one paragraph", () => {
    const blocks = parseMarkdown("line one\nline two\n\nnext para");
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toEqual({
      type: "paragraph",
      children: [{ type: "text", value: "line one line two" }],
    });
    expect(blocks[1].type).toBe("paragraph");
  });

  it("collects an unordered list", () => {
    const blocks = parseMarkdown("- first\n- second");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", value: "first" }],
          [{ type: "text", value: "second" }],
        ],
      },
    ]);
  });

  it("distinguishes ordered lists", () => {
    const blocks = parseMarkdown("1. one\n2. two");
    expect(blocks[0].type).toBe("list");
    if (blocks[0].type === "list") expect(blocks[0].ordered).toBe(true);
  });

  it("keeps a fenced code block verbatim", () => {
    const blocks = parseMarkdown("```\nconst x = 1;\n```");
    expect(blocks).toEqual([{ type: "code", value: "const x = 1;" }]);
  });

  it("folds an indented continuation line into the last list item", () => {
    const blocks = parseMarkdown("- the amortisation\n  per month");
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [
            { type: "text", value: "the amortisation" },
            { type: "text", value: " " },
            { type: "text", value: "per month" },
          ],
        ],
      },
    ]);
  });
});

describe("parseFeatureDoc", () => {
  it("lifts the leading H1 into the title and drops it from the body", () => {
    const doc = parseFeatureDoc(
      "properties",
      "# Properties sheet\n\nTrack the homes you own.",
    );
    expect(doc).toEqual({
      slug: "properties",
      title: "Properties sheet",
      body: "Track the homes you own.",
    });
  });

  it("falls back to the slug when there is no leading heading", () => {
    const doc = parseFeatureDoc("loans", "Body with no title.");
    expect(doc.title).toBe("loans");
    expect(doc.body).toBe("Body with no title.");
  });

  it("skips leading blank lines before the title", () => {
    const doc = parseFeatureDoc("x", "\n\n# Title\n\nBody.");
    expect(doc.title).toBe("Title");
    expect(doc.body).toBe("Body.");
  });
});
