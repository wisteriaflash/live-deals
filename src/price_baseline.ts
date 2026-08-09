export function median(nums: number[]): number | null {
  if (nums.length === 0) return null;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid]!;
  return (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function resolveBaseline(opts: {
  listPrice?: number;
  historicalPrices: number[];
}): number | null {
  if (opts.listPrice !== undefined && Number.isFinite(opts.listPrice) && opts.listPrice > 0) {
    return opts.listPrice;
  }
  return median(opts.historicalPrices.filter((p) => Number.isFinite(p) && p > 0));
}
