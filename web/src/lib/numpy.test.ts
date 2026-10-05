import { describe, expect, it } from "vitest";

import cases from "./__fixtures__/argsort.json";
import { npArgsort } from "./numpy";

describe("numpy.argsort (introsort) parity", () => {
  it("sorts ascending", () => {
    const v = [3, 1, 2, 5, 4];
    expect(Array.from(npArgsort(v))).toEqual([1, 2, 0, 4, 3]);
  });

  for (const c of cases as { n: number; nonzero: [number, number][]; tail: number[] }[]) {
    it(`orders ties exactly like numpy 1.26 (n = ${c.n})`, () => {
      const v = new Float64Array(c.n);
      for (const [i, x] of c.nonzero) v[i] = x;
      const order = Array.from(npArgsort(v));
      expect(order.slice(-c.tail.length)).toEqual(c.tail);
    });
  }
});
