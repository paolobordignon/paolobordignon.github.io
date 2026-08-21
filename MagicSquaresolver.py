from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, List, Optional, Sequence, Tuple


Grid4x4 = List[List[Optional[int]]]


def solve_magic_square_4x4(
    grid: Sequence[Sequence[object]],
    value_interval: Tuple[int, int],
    *,
    distinct: bool = True,
    value_predicate: Optional[Callable[[int], bool]] = None,
) -> List[List[List[int]]]:
    """
    Solve 4x4 "magic squares" where ONLY rows and columns must sum to the same
    magic constant. Diagonals are NOT constrained.

    Inputs:
    - grid: 4x4 nested sequence with ints for fixed cells and blanks as:
        None, 0, "", ".", "x", "_" (case-insensitive strings also allowed)
    - value_interval: (lo, hi) inclusive bounds for values allowed in blank cells.
      Prefilled values must also lie within [lo, hi].
    - distinct: if True, all 16 numbers must be distinct. If False, repetition is allowed.
    - value_predicate: optional function f(v)->bool restricting allowed values
      (applies to both blanks and prefilled cells). Example: lambda v: v % 4 == 0.

    Output:
    - list of solutions; each solution is a 4x4 list[list[int]].
    """

    lo, hi = value_interval
    if lo > hi:
        lo, hi = hi, lo

    g = _normalize_grid_4x4(grid)

    # Validate prefilled.
    for r in range(4):
        for c in range(4):
            v = g[r][c]
            if v is None:
                continue
            if not isinstance(v, int):
                raise TypeError(f"Grid cell ({r},{c}) is not an int/blank: {v!r}")
            if v < lo or v > hi:
                raise ValueError(
                    f"Prefilled value {v} at ({r},{c}) outside interval [{lo},{hi}]"
                )
            if value_predicate is not None and not value_predicate(v):
                raise ValueError(
                    f"Prefilled value {v} at ({r},{c}) rejected by value_predicate"
                )

    if distinct:
        seen = {}
        for r in range(4):
            for c in range(4):
                v = g[r][c]
                if v is None:
                    continue
                if v in seen:
                    (pr, pc) = seen[v]
                    raise ValueError(
                        f"Duplicate prefilled value {v} at ({pr},{pc}) and ({r},{c})"
                    )
                seen[v] = (r, c)

    solutions: List[List[List[int]]] = []

    if value_predicate is None:
        all_values = list(range(lo, hi + 1))
    else:
        all_values = [v for v in range(lo, hi + 1) if value_predicate(v)]
    if distinct:
        remaining = sorted(v for v in all_values if v not in {x for row in g for x in row if x is not None})
        used = {x for row in g for x in row if x is not None}
    else:
        remaining = all_values[:]  # conceptual; we won't remove
        used = set()

    # Precompute row/col sums and blank counts.
    row_sum = [0, 0, 0, 0]
    col_sum = [0, 0, 0, 0]
    row_blanks = [0, 0, 0, 0]
    col_blanks = [0, 0, 0, 0]
    blanks: List[Tuple[int, int]] = []

    for r in range(4):
        for c in range(4):
            v = g[r][c]
            if v is None:
                blanks.append((r, c))
                row_blanks[r] += 1
                col_blanks[c] += 1
            else:
                row_sum[r] += v
                col_sum[c] += v

    # Determine candidate magic constants M to try.
    # Bounds from allowed values.
    if not all_values:
        return []
    min_allowed = min(all_values)
    max_allowed = max(all_values)
    m_min = 4 * min_allowed
    m_max = 4 * max_allowed

    # Tighten with prefilled per-row/per-col feasibility (loose but useful).
    for r in range(4):
        s = row_sum[r]
        k = row_blanks[r]
        m_min = max(m_min, s + k * min_allowed)
        m_max = min(m_max, s + k * max_allowed)
    for c in range(4):
        s = col_sum[c]
        k = col_blanks[c]
        m_min = max(m_min, s + k * min_allowed)
        m_max = min(m_max, s + k * max_allowed)

    # If fully filled, M is fixed.
    if not blanks:
        if row_sum.count(row_sum[0]) == 4 and col_sum.count(col_sum[0]) == 4 and row_sum[0] == col_sum[0]:
            return [[[_must_int(g[r][c]) for c in range(4)] for r in range(4)]]
        return []

    # For distinct + interval size == 16, M is fixed by total sum.
    if distinct and (hi - lo + 1) == 16:
        total = sum(range(lo, hi + 1))
        if total % 4 != 0:
            return []
        m_min = m_max = total // 4

    # Also, if distinct, we need at least 16 distinct numbers available.
    if distinct and len(all_values) < 16:
        return []

    # If distinct, total sum bounds (choosing any 16 numbers from interval) can tighten M,
    # but we keep it simple unless interval is exactly 16.
    if m_min > m_max:
        return []

    @dataclass
    class State:
        g: Grid4x4
        remaining_sorted: List[int]
        used: set
        row_sum: List[int]
        col_sum: List[int]
        row_blanks: List[int]
        col_blanks: List[int]

    def sum_k_smallest(rem_sorted: List[int], k: int) -> int:
        # rem_sorted already sorted asc.
        if k <= 0:
            return 0
        if k > len(rem_sorted):
            # impossible under distinct
            return 10**18
        return sum(rem_sorted[:k])

    def sum_k_largest(rem_sorted: List[int], k: int) -> int:
        if k <= 0:
            return 0
        if k > len(rem_sorted):
            return -10**18
        return sum(rem_sorted[-k:])

    def feasible_line(sum_now: int, blanks_left: int, target: int, rem_sorted: List[int]) -> bool:
        if blanks_left < 0:
            return False
        need = target - sum_now
        if blanks_left == 0:
            return need == 0
        if distinct:
            mn = sum_k_smallest(rem_sorted, blanks_left)
            mx = sum_k_largest(rem_sorted, blanks_left)
            return mn <= need <= mx
        return blanks_left * min_allowed <= need <= blanks_left * max_allowed

    def candidate_values_for_cell(st: State, r: int, c: int, target: int) -> List[int]:
        rs = st.row_sum[r]
        cs = st.col_sum[c]
        rb = st.row_blanks[r]
        cb = st.col_blanks[c]

        # For row: v + sum(other blanks) = target - rs
        # So v must be within [need_row - max_other, need_row - min_other].
        need_row = target - rs
        need_col = target - cs

        if distinct:
            rem = st.remaining_sorted
            # other blanks count excludes this cell
            row_other = rb - 1
            col_other = cb - 1
            row_min_other = sum_k_smallest(rem, row_other)
            row_max_other = sum_k_largest(rem, row_other)
            col_min_other = sum_k_smallest(rem, col_other)
            col_max_other = sum_k_largest(rem, col_other)
        else:
            row_other = rb - 1
            col_other = cb - 1
            row_min_other = row_other * lo
            row_max_other = row_other * hi
            col_min_other = col_other * lo
            col_max_other = col_other * hi

        vmin = max(min_allowed, need_row - row_max_other, need_col - col_max_other)
        vmax = min(max_allowed, need_row - row_min_other, need_col - col_min_other)
        if vmin > vmax:
            return []

        if distinct:
            # Only remaining values in range.
            # rem is sorted; filter.
            return [v for v in st.remaining_sorted if vmin <= v <= vmax]
        if value_predicate is None:
            return list(range(vmin, vmax + 1))
        return [v for v in range(vmin, vmax + 1) if value_predicate(v)]

    def pick_next_blank(st: State, target: int) -> Tuple[int, int, List[int]]:
        # MRV: choose blank with smallest candidate set.
        best_cell = (-1, -1)
        best_cands: List[int] = []
        best_len = 10**9
        for (r, c) in blanks:
            if st.g[r][c] is not None:
                continue
            cands = candidate_values_for_cell(st, r, c, target)
            n = len(cands)
            if n == 0:
                return (r, c, [])
            if n < best_len:
                best_len = n
                best_cell = (r, c)
                best_cands = cands
                if n == 1:
                    break
        return best_cell[0], best_cell[1], best_cands

    def remove_once_sorted(rem_sorted: List[int], v: int) -> Optional[List[int]]:
        # rem_sorted is sorted; remove one instance (it should exist).
        # 16-depth search, so O(n) copy is fine.
        i = 0
        j = len(rem_sorted)
        while i < j:
            m = (i + j) // 2
            if rem_sorted[m] < v:
                i = m + 1
            else:
                j = m
        if i >= len(rem_sorted) or rem_sorted[i] != v:
            return None
        return rem_sorted[:i] + rem_sorted[i + 1 :]

    def backtrack(st: State, target: int) -> None:
        # Early prune: every row/col still feasible.
        for r in range(4):
            if not feasible_line(st.row_sum[r], st.row_blanks[r], target, st.remaining_sorted):
                return
        for c in range(4):
            if not feasible_line(st.col_sum[c], st.col_blanks[c], target, st.remaining_sorted):
                return

        r, c, cands = pick_next_blank(st, target)
        if r == -1:
            # no blanks left
            sol = [[_must_int(st.g[i][j]) for j in range(4)] for i in range(4)]
            solutions.append(sol)
            return
        if not cands:
            return

        for v in cands:
            if distinct and v in st.used:
                continue

            # Place
            st.g[r][c] = v
            st.row_sum[r] += v
            st.col_sum[c] += v
            st.row_blanks[r] -= 1
            st.col_blanks[c] -= 1

            prev_used_added = False
            prev_remaining = None
            if distinct:
                prev_used_added = v not in st.used
                st.used.add(v)
                prev_remaining = st.remaining_sorted
                new_remaining = remove_once_sorted(prev_remaining, v)
                if new_remaining is None:
                    # undo
                    st.g[r][c] = None
                    st.row_sum[r] -= v
                    st.col_sum[c] -= v
                    st.row_blanks[r] += 1
                    st.col_blanks[c] += 1
                    if prev_used_added:
                        st.used.remove(v)
                    continue
                st.remaining_sorted = new_remaining

            # If a row/col just completed, it must equal target exactly.
            if st.row_blanks[r] == 0 and st.row_sum[r] != target:
                pass
            elif st.col_blanks[c] == 0 and st.col_sum[c] != target:
                pass
            else:
                backtrack(st, target)

            # Undo
            if distinct:
                st.remaining_sorted = prev_remaining  # type: ignore[assignment]
                if prev_used_added:
                    st.used.remove(v)
            st.g[r][c] = None
            st.row_sum[r] -= v
            st.col_sum[c] -= v
            st.row_blanks[r] += 1
            st.col_blanks[c] += 1

    base_state = State(
        g=[row[:] for row in g],
        remaining_sorted=remaining[:] if distinct else [],
        used=set(used),
        row_sum=row_sum[:],
        col_sum=col_sum[:],
        row_blanks=row_blanks[:],
        col_blanks=col_blanks[:],
    )

    for target in range(m_min, m_max + 1):
        backtrack(base_state, target)

    return solutions


def _normalize_grid_4x4(grid: Sequence[Sequence[object]]) -> Grid4x4:
    if len(grid) != 4 or any(len(row) != 4 for row in grid):
        raise ValueError("grid must be 4x4")

    def is_blank(x: object) -> bool:
        if x is None:
            return True
        if isinstance(x, int):
            return x == 0
        if isinstance(x, str):
            s = x.strip().lower()
            return s in {"", ".", "x", "_", "0", "none", "null"}
        return False

    out: Grid4x4 = [[None] * 4 for _ in range(4)]
    for r in range(4):
        for c in range(4):
            v = grid[r][c]
            if is_blank(v):
                out[r][c] = None
            elif isinstance(v, int):
                out[r][c] = v
            elif isinstance(v, str):
                s = v.strip()
                try:
                    out[r][c] = int(s)
                except ValueError as e:
                    raise ValueError(f"Unrecognized cell value at ({r},{c}): {v!r}") from e
            else:
                raise TypeError(f"Unrecognized cell value at ({r},{c}): {v!r}")
    return out


def _must_int(x: Optional[int]) -> int:
    if x is None:
        raise ValueError("internal error: expected int but found blank")
    return x


if __name__ == "__main__":
    # Example: solve with values 1..16, distinct, no diagonal constraint.
    puzzle = [
        [16, None, None, 13],
        [None, 11, None, None],
        [None, None, 6, None],
        [1, None, None, 4],
    ]
    sols = solve_magic_square_4x4(puzzle, (1, 16), distinct=True)
    print(f"solutions: {len(sols)}")
    for i, sol in enumerate(sols[:5], start=1):
        print(f"\nSolution {i}:")
        for row in sol:
            print(row)
