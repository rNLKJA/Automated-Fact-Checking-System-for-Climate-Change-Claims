/**
 * `numpy.argsort(a)` with the default `kind="quicksort"` for float64 arrays,
 * ported from numpy 1.26 `npysort/quicksort.cpp` (`aquicksort_` + `aheapsort_`).
 *
 * numpy's quicksort is an introsort and is NOT stable: how it orders equal
 * values depends on the whole array. The team's keyword extraction took
 * `np.argsort(row)[-10:]` over a mostly-zero TF-IDF row, so for short passages
 * the "top 10" is padded with zero-weight features picked by this exact tie
 * order (which is how the Arabic word محمد, the last feature of the 20,000-term
 * vocabulary, ended up in many evidence tags). Reproducing the tags therefore
 * needs the same algorithm, not just any sort.
 */

const SMALL_QUICKSORT = 15; // numpy 1.26 npysort/quicksort.cpp

function less(a: number, b: number): boolean {
  // numpy's DOUBLE_LT: NaNs sort to the end
  return a < b || (b !== b && a === a);
}

function msb(n: number): number {
  let depth = 0;
  while ((n >>= 1) > 0) depth++;
  return depth;
}

/** `aheapsort_`, used by the introsort when the recursion budget runs out. */
function aheapsort(v: ArrayLike<number>, tosort: Int32Array, start: number, n: number): void {
  // 1-based heap indexing into tosort[start .. start + n - 1]
  const a = (k: number) => tosort[start + k - 1];
  const set = (k: number, x: number) => {
    tosort[start + k - 1] = x;
  };
  let i: number;
  let j: number;
  let tmp: number;
  for (let l = n >> 1; l > 0; --l) {
    tmp = a(l);
    for (i = l, j = l << 1; j <= n;) {
      if (j < n && less(v[a(j)], v[a(j + 1)])) j += 1;
      if (less(v[tmp], v[a(j)])) {
        set(i, a(j));
        i = j;
        j += j;
      } else break;
    }
    set(i, tmp);
  }
  for (; n > 1;) {
    tmp = a(n);
    set(n, a(1));
    n -= 1;
    for (i = 1, j = 2; j <= n;) {
      if (j < n && less(v[a(j)], v[a(j + 1)])) j++;
      if (less(v[tmp], v[a(j)])) {
        set(i, a(j));
        i = j;
        j += j;
      } else break;
    }
    set(i, tmp);
  }
}

/** Indices that would sort `v` ascending, exactly as `np.argsort(v)` orders them. */
export function npArgsort(v: ArrayLike<number>): Int32Array {
  const num = v.length;
  const tosort = new Int32Array(num);
  for (let i = 0; i < num; i++) tosort[i] = i;
  if (num < 2) return tosort;

  const swap = (x: number, y: number) => {
    const t = tosort[x];
    tosort[x] = tosort[y];
    tosort[y] = t;
  };

  let pl = 0;
  let pr = num - 1;
  const stack: number[] = [];
  const depthStack: number[] = [];
  let cdepth = msb(num) * 2;

  for (;;) {
    let heapsorted = false;
    if (cdepth < 0) {
      aheapsort(v, tosort, pl, pr - pl + 1);
      heapsorted = true;
    } else {
      while (pr - pl > SMALL_QUICKSORT) {
        const pm = pl + ((pr - pl) >> 1);
        if (less(v[tosort[pm]], v[tosort[pl]])) swap(pm, pl);
        if (less(v[tosort[pr]], v[tosort[pm]])) swap(pr, pm);
        if (less(v[tosort[pm]], v[tosort[pl]])) swap(pm, pl);
        const vp = v[tosort[pm]];
        let pi = pl;
        let pj = pr - 1;
        swap(pm, pj);
        for (;;) {
          do ++pi;
          while (less(v[tosort[pi]], vp));
          do --pj;
          while (less(vp, v[tosort[pj]]));
          if (pi >= pj) break;
          swap(pi, pj);
        }
        const pk = pr - 1;
        swap(pi, pk);
        // push the larger partition, keep working on the smaller one
        if (pi - pl < pr - pi) {
          stack.push(pi + 1, pr);
          pr = pi - 1;
        } else {
          stack.push(pl, pi - 1);
          pl = pi + 1;
        }
        depthStack.push(--cdepth);
      }
    }
    if (!heapsorted) {
      // insertion sort
      for (let pi = pl + 1; pi <= pr; ++pi) {
        const vi = tosort[pi];
        const vpv = v[vi];
        let pj = pi;
        let pk = pi - 1;
        while (pj > pl && less(vpv, v[tosort[pk]])) {
          tosort[pj--] = tosort[pk--];
        }
        tosort[pj] = vi;
      }
    }
    if (stack.length === 0) break;
    pr = stack.pop() as number;
    pl = stack.pop() as number;
    cdepth = depthStack.pop() as number;
  }
  return tosort;
}
