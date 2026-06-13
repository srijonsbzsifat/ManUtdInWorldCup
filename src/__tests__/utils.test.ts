import { describe, it, expect, vi } from "vitest";
import { runWithConcurrencyLimit } from "@/lib/utils";

describe("runWithConcurrencyLimit", () => {
  it("returns all results in original order", async () => {
    const results = await runWithConcurrencyLimit([1, 2, 3], (x) => Promise.resolve(x * 2), 2);
    expect(results).toHaveLength(3);
    expect(results[0]).toMatchObject({ status: "fulfilled", value: 2 });
    expect(results[1]).toMatchObject({ status: "fulfilled", value: 4 });
    expect(results[2]).toMatchObject({ status: "fulfilled", value: 6 });
  });

  it("captures rejections without throwing", async () => {
    const results = await runWithConcurrencyLimit(
      [1, 2, 3],
      (x) => (x === 2 ? Promise.reject(new Error("fail")) : Promise.resolve(x)),
      2
    );
    expect(results[0]).toMatchObject({ status: "fulfilled", value: 1 });
    expect(results[1]).toMatchObject({ status: "rejected" });
    expect(results[2]).toMatchObject({ status: "fulfilled", value: 3 });
  });

  it("caps concurrent execution at the given limit", async () => {
    let concurrent = 0;
    let maxSeen = 0;
    const task = () =>
      new Promise<void>((resolve) => {
        concurrent++;
        maxSeen = Math.max(maxSeen, concurrent);
        setTimeout(() => {
          concurrent--;
          resolve();
        }, 10);
      });
    await runWithConcurrencyLimit(Array(8).fill(null), task, 3);
    expect(maxSeen).toBeLessThanOrEqual(3);
  });

  it("handles an empty list", async () => {
    const results = await runWithConcurrencyLimit([], () => Promise.resolve(1), 4);
    expect(results).toHaveLength(0);
  });

  it("handles concurrency > list length without error", async () => {
    const results = await runWithConcurrencyLimit([1, 2], (x) => Promise.resolve(x), 10);
    expect(results).toHaveLength(2);
  });
});
