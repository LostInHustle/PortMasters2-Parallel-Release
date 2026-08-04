// =====================================================================
// A small async-aware sibling to ../harness.ts, for the E2E scenario
// suite specifically. The original harness's test() is fire-and-forget
// synchronous (`fn: () => void`, never awaited by its callers) — every
// existing suite relies on that to run instantly and report a truthful
// summary the moment the script finishes. E2E scenarios need to `await
// page.click(...)` inside a test body, and making the shared test()
// async without every caller awaiting it would let summary() run before
// any results land (await, even on a non-Promise, always yields at least
// one microtask). Rather than risk that regression across six passing
// suites, this is its own module: same shape, `test()` awaited by design.
// The pure assertion helpers have no state to duplicate, so they're
// re-exported straight from the original.
// =====================================================================
export { assert, assertEqual, assertClose, assertArrayEqual } from "../harness";

type Result = { name: string; error?: string };

const results: Result[] = [];
let currentSuite = "";

export function suite(name: string) {
  currentSuite = name;
  console.log(`\n=== ${name} ===`);
}

export async function test(
  name: string,
  fn: () => void | Promise<void>,
): Promise<void> {
  const label = `${currentSuite} :: ${name}`;
  try {
    await fn();
    results.push({ name: label });
    console.log(`  ✓ ${name}`);
  } catch (e) {
    results.push({ name: label, error: (e as Error).message });
    console.log(`  ✗ ${name}`);
    console.log(`      ${(e as Error).message}`);
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
