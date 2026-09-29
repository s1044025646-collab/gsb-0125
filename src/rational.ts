/**
 * Exact rational arithmetic backed by native BigInt.
 * Fractions are always kept in reduced form with a positive denominator.
 */
export class Fraction {
  readonly n: bigint;
  readonly d: bigint;

  constructor(n: bigint | number | string, d: bigint | number | string = 1n) {
    let num = BigInt(n);
    let den = BigInt(d);
    if (den === 0n) throw new Error("division by zero");
    if (den < 0n) {
      num = -num;
      den = -den;
    }
    const g = gcdAbs(num, den);
    this.n = num / g;
    this.d = den / g;
  }

  static ZERO = new Fraction(0n);
  static ONE = new Fraction(1n);

  add(o: Fraction): Fraction {
    return new Fraction(this.n * o.d + o.n * this.d, this.d * o.d);
  }
  sub(o: Fraction): Fraction {
    return new Fraction(this.n * o.d - o.n * this.d, this.d * o.d);
  }
  mul(o: Fraction): Fraction {
    return new Fraction(this.n * o.n, this.d * o.d);
  }
  div(o: Fraction): Fraction {
    if (o.n === 0n) throw new Error("division by zero");
    return new Fraction(this.n * o.d, this.d * o.n);
  }
  neg(): Fraction {
    return new Fraction(-this.n, this.d);
  }
  abs(): Fraction {
    return new Fraction(this.n < 0n ? -this.n : this.n, this.d);
  }
  sign(): -1 | 0 | 1 {
    return this.n < 0n ? -1 : this.n > 0n ? 1 : 0;
  }
  isZero(): boolean {
    return this.n === 0n;
  }
  equals(o: Fraction): boolean {
    return this.n === o.n && this.d === o.d;
  }
  /** Decimal string with enough precision to be lossless for typical molar math. */
  toNumber(): number {
    return Number(this.n) / Number(this.d);
  }
  toFixed(digits = 6): string {
    return this.toNumber().toFixed(digits);
  }
  toString(): string {
    return this.d === 1n ? this.n.toString() : `${this.n}/${this.d}`;
  }

  static min(a: Fraction, b: Fraction): Fraction {
    return a.n * b.d <= b.n * a.d ? a : b;
  }
}

export function gcdBig(a: bigint, b: bigint): bigint {
  return gcdAbs(a, b);
}

function gcdAbs(a: bigint, b: bigint): bigint {
  a = a < 0n ? -a : a;
  b = b < 0n ? -b : b;
  while (b) {
    [a, b] = [b, a % b];
  }
  return a === 0n ? 1n : a;
}

export function lcmBig(a: bigint, b: bigint): bigint {
  if (a === 0n || b === 0n) return 0n;
  return (a / gcdAbs(a, b)) * b;
}

/**
 * Parse a finite decimal or integer string (e.g. "1.25", "100", "0.5")
 * into an exact Fraction. Supports trailing exponent-free decimals only.
 */
export function fractionFromDecimal(input: string): Fraction {
  const s = input.trim();
  if (!/^[+-]?(\d+\.\d+|\d+|\.\d+)$/.test(s)) {
    throw new Error(`not a finite decimal number: "${input}"`);
  }
  const neg = s.startsWith("-");
  const body = neg ? s.slice(1) : s.startsWith("+") ? s.slice(1) : s;
  const dot = body.indexOf(".");
  const intPart = dot === -1 ? body : body.slice(0, dot);
  const fracPart = dot === -1 ? "" : body.slice(dot + 1);
  const num = BigInt((intPart || "0") + fracPart || "0");
  const den = 10n ** BigInt(fracPart.length);
  const f = new Fraction(num, den);
  return neg ? f.neg() : f;
}
