import { Fragment, type ReactNode } from "react";

/**
 * Minimal Markdown renderer, enough for product descriptions (heading, list,
 * bold, inline code).
 *
 * Hand-written on purpose: it produces React elements, never raw HTML. Since
 * the text is authored in the admin panel and ends up on a public page, using
 * `dangerouslySetInnerHTML` with a generic parser would open the door to XSS.
 */

function inline(text: string, key: string): ReactNode {
  // Splits on **bold** and `code`, leaving everything else as plain text.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);

  return parts.map((part, index) => {
    const partKey = `${key}-${index}`;
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={partKey} className="font-semibold text-ink">
          {part.slice(2, -2)}
        </strong>
      );
    }
    if (part.startsWith("`") && part.endsWith("`") && part.length > 2) {
      return (
        <code
          key={partKey}
          className="rounded-control bg-surface-inset px-1.5 py-0.5 font-mono text-[0.85em] text-ink"
        >
          {part.slice(1, -1)}
        </code>
      );
    }
    return <Fragment key={partKey}>{part}</Fragment>;
  });
}

export function Markdown({ text, level = 2 }: { text: string; level?: 2 | 3 }) {
  const Heading = (level === 2 ? "h2" : "h3") as "h2" | "h3";
  const lines = text.split("\n");
  const blocks: ReactNode[] = [];
  let openList: string[] = [];

  const closeList = () => {
    if (openList.length === 0) return;
    const items = openList;
    openList = [];
    blocks.push(
      <ul key={`ul-${blocks.length}`} className="my-3 space-y-2">
        {items.map((item, index) => (
          <li key={index} className="flex gap-2.5 text-sm leading-relaxed text-ink-muted">
            <span
              aria-hidden="true"
              className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint"
            />
            <span>{inline(item, `li-${blocks.length}-${index}`)}</span>
          </li>
        ))}
      </ul>,
    );
  };

  for (const line of lines) {
    const trimmed = line.trim();

    if (trimmed.startsWith("- ")) {
      openList.push(trimmed.slice(2));
      continue;
    }
    closeList();

    if (trimmed === "") continue;

    if (trimmed.startsWith("### ")) {
      blocks.push(
        <Heading
          key={`h-${blocks.length}`}
          className="mt-5 font-display text-base font-bold text-ink first:mt-0"
        >
          {trimmed.slice(4)}
        </Heading>,
      );
      continue;
    }

    blocks.push(
      <p key={`p-${blocks.length}`} className="my-2 text-sm leading-relaxed text-ink-muted">
        {inline(trimmed, `p-${blocks.length}`)}
      </p>,
    );
  }
  closeList();

  return <div>{blocks}</div>;
}
