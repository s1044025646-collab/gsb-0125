/**
 * Chemical formula parser.
 *
 * Grammar (position tracked, 0-based offset returned in every error):
 *   formula  := group+ ( "." count? group+ )*      // crystal water e.g. CuSO4.5H2O
 *   group    := element digits? | "(" formula ")" digits? | "[" formula "]" digits? | "{" formula "}" digits?
 *   element  := uppercase (lowercase)*             // validated against the atomic table
 *   digits   := positive integer
 *
 * The leading coefficient before a dot ("5" in ".5H2O") is shorthand for
 * the multiplier of the following bracketed group list.
 */

export interface ParseError {
  code:
    | "EMPTY_FORMULA"
    | "UNKNOWN_ELEMENT"
    | "BAD_DIGITS"
    | "UNEXPECTED_CHAR"
    | "UNMATCHED_OPEN"
    | "UNMATCHED_CLOSE"
    | "DANGLING_DOT"
    | "BAD_BRACKET";
  message: string;
  /** 0-based character offset in the original formula string. */
  position: number;
}

export type CountMap = Map<string, bigint>;

export interface ParseResult {
  /** element symbol -> total atom count (exact integers) */
  counts: CountMap;
  /** normalized form, e.g. CuSO4·5H2O */
  normalized: string;
}

const OPEN = new Set(["(", "[", "{"]);
const CLOSE = new Set([")", "]", "}"]);
const MATCH: Record<string, string> = { ")": "(", "]": "[", "}": "{" };

class Parser {
  private pos = 0;

  constructor(
    private readonly src: string,
    private readonly known: Set<string>,
  ) {}

  parse(): ParseResult {
    if (this.src.trim() === "") throw this.err("EMPTY_FORMULA", "formula is empty", 0);
    const parts: CountMap[] = [this.parseSequence(undefined)];
    while (this.peek() === ".") {
      const dotPos = this.pos;
      this.pos++; // consume '.'
      if (this.pos >= this.src.length) throw this.err("DANGLING_DOT", "dangling '.' with no hydrate group", dotPos);
      parts.push(this.parseSequence(undefined));
    }
    if (this.pos !== this.src.length) {
      throw this.err("UNEXPECTED_CHAR", `unexpected character "${this.src[this.pos]}"`, this.pos);
    }
    const counts: CountMap = new Map();
    for (const part of parts) mergeInto(counts, part);
    return { counts, normalized: render(counts) };
  }

  /** Parse groups until end of string, a closing bracket, or a '.' (which belongs to the caller). */
  private parseSequence(stop: string | undefined): CountMap {
    const out: CountMap = new Map();
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (CLOSE.has(ch)) {
        if (stop === undefined) throw this.err("UNMATCHED_CLOSE", `unmatched closing bracket "${ch}"`, this.pos);
        if (MATCH[ch] !== stop) throw this.err("BAD_BRACKET", `expected "${this.closingOf(stop)}" but found "${ch}"`, this.pos);
        break;
      }
      if (ch === ".") {
        if (stop !== undefined) throw this.err("UNEXPECTED_CHAR", "'.' is not allowed inside brackets", this.pos);
        break;
      }
      if (OPEN.has(ch)) {
        const openPos = this.pos;
        const open = ch;
        this.pos++;
        const inner = this.parseSequence(open);
        if (this.pos >= this.src.length || this.src[this.pos] !== this.closingOf(open)) {
          throw this.err("UNMATCHED_OPEN", `unmatched opening bracket "${open}"`, openPos);
        }
        this.pos++; // consume closing bracket
        const mult = this.readDigits(1n);
        scaleInto(out, inner, mult);
      } else if (isUpper(ch)) {
        const start = this.pos;
        let sym = ch;
        this.pos++;
        while (this.pos < this.src.length && isLower(this.src[this.pos])) {
          sym += this.src[this.pos];
          this.pos++;
        }
        if (!this.known.has(sym)) {
          throw this.err("UNKNOWN_ELEMENT", `unknown element "${sym}" (not present in the active atomic-weight table)`, start);
        }
        const mult = this.readDigits(1n);
        out.set(sym, (out.get(sym) ?? 0n) + mult);
      } else if (isDigit(ch)) {
        throw this.err("UNEXPECTED_CHAR", `subscript digits without a preceding element or group`, this.pos);
      } else {
        throw this.err("UNEXPECTED_CHAR", `unexpected character "${ch}"`, this.pos);
      }
    }
    if (out.size === 0) throw this.err("EMPTY_FORMULA", "empty group", this.pos);
    return out;
  }

  /** Read a positive integer multiplier; a hydrate dot may be followed directly by the number. */
  private readDigits(defaultValue: bigint): bigint {
    const start = this.pos;
    let s = "";
    while (this.pos < this.src.length && isDigit(this.src[this.pos])) {
      s += this.src[this.pos];
      this.pos++;
    }
    if (s === "") return defaultValue;
    if (s === "0" || /^0\d/.test(s)) {
      throw this.err("BAD_DIGITS", `subscript must be a positive integer without leading zeros`, start);
    }
    return BigInt(s);
  }

  private peek(): string | undefined {
    return this.src[this.pos];
  }

  private closingOf(open: string): string {
    return open === "(" ? ")" : open === "[" ? "]" : "}";
  }

  private err(code: ParseError["code"], message: string, position: number): ParseError {
    const e = new Error(message) as Error & ParseError;
    e.code = code;
    e.position = position;
    return e;
  }
}

function isDigit(ch: string): boolean {
  return ch >= "0" && ch <= "9";
}
function isUpper(ch: string): boolean {
  return ch >= "A" && ch <= "Z";
}
function isLower(ch: string): boolean {
  return ch >= "a" && ch <= "z";
}

export function mergeInto(dst: CountMap, src: CountMap): void {
  for (const [k, v] of src) dst.set(k, (dst.get(k) ?? 0n) + v);
}

export function scaleInto(dst: CountMap, src: CountMap, mult: bigint): void {
  for (const [k, v] of src) dst.set(k, (dst.get(k) ?? 0n) + v * mult);
}

export function parseFormula(formula: string, knownElements: Iterable<string>): ParseResult {
  return new Parser(formula, new Set(knownElements)).parse();

}

/** Pretty rendering using the middle dot for hydrate separators is done at the call site if needed. */
function render(counts: CountMap): string {
  return [...counts.entries()]
    .map(([el, n]) => el + (n === 1n ? "" : n.toString()))
    .join("");
}
