// =====================================================================
// Minimal assert-based test harness for the game-logic test scripts in
// this directory. No framework dependency (jest/vitest aren't installed
// in this project) — just enough structure to group assertions, report
// failures with context, and exit non-zero on the first regression a CI
// or a developer needs to notice.
// =====================================================================

type Result = { name: string; error?: string };

const results: Result[] = [];
let currentSuite = "";

export function suite(name: string) {
  currentSuite = name;
  console.log(`\n=== ${name} ===`);
}

export function test(name: string, fn: () => void) {
  const label = `${currentSuite} :: ${name}`;
  try {
    fn();
    results.push({ name: label });
  } catch (e) {
    results.push({ name: label, error: (e as Error).message });
  }
}

export function assert(cond: boolean, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

export function assertEqual<T>(actual: T, expected: T, msg: string) {
  if (actual !== expected) {
    throw new Error(
      `${msg}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`,
    );
  }
}

export function assertClose(
  actual: number,
  expected: number,
  eps: number,
  msg: string,
) {
  if (Math.abs(actual - expected) > eps) {
    throw new Error(`${msg}: expected ~${expected} (±${eps}), got ${actual}`);
  }
}

export function assertArrayEqual<T>(actual: T[], expected: T[], msg: string) {
  const a = [...actual].sort();
  const b = [...expected].sort();
  if (a.length !== b.length || a.some((v, i) => v !== b[i])) {
    throw new Error(
      `${msg}: expected [${b.join(", ")}], got [${a.join(", ")}]`,
    );
  }
}

// Deterministically drives a probabilistic branch: swaps Math.random for a
// stub that always returns `value`, runs `fn`, then restores the original.
// This is what turns "chance to X" engine code (pirate raids, salvage crane,
// tax audits, corrupt brokers) into something a unit test can pin down
// exactly, instead of relying on running enough trials to be statistically
// confident.
export function withFixedRandom<T>(value: number, fn: () => T): T {
  const orig = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = orig;
  }
}

export function summary(): boolean {
  const failed = results.filter((r) => r.error);
  const passed = results.length - failed.length;
  console.log(`\n${"=".repeat(60)}`);
  console.log(`${passed}/${results.length} passed`);
  if (failed.length) {
    console.log(`\n${failed.length} FAILURE(S):`);
    for (const f of failed) {
      console.log(`  ✗ ${f.name}`);
      console.log(`      ${f.error}`);
    }
  }
  console.log("=".repeat(60));
  return failed.length === 0;
}
