/**
 * Plain text -> LaTeX. pdfLaTeX (with T1 + utf8) can typeset Latin
 * scripts; anything else (Hangul, Khmer, emoji ...) is replaced with "?"
 * and reported, because it would otherwise stop the whole book build.
 */

const SYMBOLS: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "{": "\\{",
  "}": "\\}",
  $: "\\$",
  "&": "\\&",
  "#": "\\#",
  "%": "\\%",
  _: "\\_",
  "^": "\\textasciicircum{}",
  "~": "\\textasciitilde{}",
  "<": "\\textless{}",
  ">": "\\textgreater{}",
  "|": "\\textbar{}",
  "\u00a0": "~",
  "\u2026": "\\ldots{}",
  "\u2013": "--",
  "\u2014": "---",
  "\u2018": "`",
  "\u2019": "'",
  "\u201c": "``",
  "\u201d": "''",
  "\u2022": "\\textbullet{}",
  "\u20ac": "\\texteuro{}",
  "\u20a9": "\\textwon{}",
  "\u00a9": "\\textcopyright{}",
  "\u00ae": "\\textregistered{}",
  "\u2122": "\\texttrademark{}",
  "\u00b0": "\\textdegree{}",
  "\u00d7": "\\texttimes{}",
  "\u00b1": "\\textpm{}",
  "\u2192": "\\textrightarrow{}",
  "\u2190": "\\textleftarrow{}",
  "\u2264": "$\\leq$",
  "\u2265": "$\\geq$",
  "\u2248": "$\\approx$",
  "\u2260": "$\\neq$",
  "\u2032": "'",
  "\u200b": "",
  "\ufeff": "",
};

/** Characters pdfLaTeX handles directly: Latin-1 and Latin Extended-A. */
function isLatin(cp: number) {
  return (cp >= 0x20 && cp < 0x7f) || (cp >= 0xa0 && cp < 0x180);
}

export function isSupportedChar(ch: string) {
  return ch in SYMBOLS || ch === "\n" || ch === "\t" || isLatin(ch.codePointAt(0)!);
}

/** Unsupported characters in `text`, without duplicates. */
export function unsupportedChars(text: string): string[] {
  const out = new Set<string>();
  for (const ch of text) if (!isSupportedChar(ch)) out.add(ch);
  return [...out];
}

export interface EscapeOptions {
  /** Inside \code{}: no smart quotes. */
  code?: boolean;
  /** Called once per unsupported character. */
  onUnsupported?: (ch: string) => void;
  /** The character printed just before `text` (decides opening vs closing quotes). */
  prevChar?: string;
}

export function escapeText(text: string, opts: EscapeOptions = {}): string {
  let out = "";
  let prev = opts.prevChar ?? "";
  for (const ch of text) {
    if (ch === '"' && !opts.code) {
      out += /^$|[\s([{\u2014\u2013-]/.test(prev) ? "``" : "''";
    } else if (ch === "'" && !opts.code) {
      out += /^$|[\s([{]/.test(prev) ? "`" : "'";
    } else if (ch === "-" && opts.code) {
      out += "-{}"; // stop "--" becoming a dash in \texttt
    } else if (ch in SYMBOLS) {
      out += SYMBOLS[ch];
    } else if (ch === "\n" || ch === "\t") {
      out += " ";
    } else if (isLatin(ch.codePointAt(0)!)) {
      out += ch;
    } else {
      opts.onUnsupported?.(ch);
      out += "?";
    }
    prev = ch;
  }
  return out;
}

/** Escaping for the URL argument of \href / \url. */
export function escapeUrl(url: string): string {
  return url.replace(/[\\{}]/g, "").replace(/%/g, "\\%").replace(/#/g, "\\#");
}

/**
 * Code listings (lstlisting) are copied verbatim, but pdfLaTeX's listings
 * cannot handle multi-byte UTF-8, so non-ASCII characters are replaced.
 */
export function sanitizeCode(code: string, onUnsupported?: (ch: string) => void): string {
  const map: Record<string, string> = {
    "\u2018": "'",
    "\u2019": "'",
    "\u201c": '"',
    "\u201d": '"',
    "\u2013": "-",
    "\u2014": "--",
    "\u2026": "...",
    "\u00a0": " ",
    "\t": "    ",
  };
  let out = "";
  for (const ch of code) {
    const cp = ch.codePointAt(0)!;
    if (ch in map) out += map[ch];
    else if (ch === "\n" || (cp >= 0x20 && cp < 0x7f)) out += ch;
    else if (ch === "\r") continue;
    else {
      onUnsupported?.(ch);
      out += "?";
    }
  }
  // A literal end tag would close the listing early.
  return out.replace(/\\end\{lstlisting\}/g, "\\end {lstlisting}");
}

/**
 * Captions are plain text; `backticks` mark inline code, as in Markdown.
 */
export function escapeCaption(text: string, opts: EscapeOptions = {}): string {
  return text
    .split(/(`[^`]+`)/)
    .map((part) =>
      part.startsWith("`") && part.endsWith("`") && part.length > 2
        ? `\\code{${escapeText(part.slice(1, -1), { ...opts, code: true })}}`
        : escapeText(part, opts),
    )
    .join("");
}
