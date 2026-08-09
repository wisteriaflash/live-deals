export function evaluateDiscountGate(opts: {
  price: number;
  baseline: number;
  minDiscountYuan: number;
  minDiscountRatio: number;
}): { ok: boolean; saveYuan: number; saveRatio: number } {
  const saveYuan = opts.baseline - opts.price;
  const saveRatio = opts.baseline > 0 ? saveYuan / opts.baseline : 0;
  const ok =
    saveYuan >= opts.minDiscountYuan || saveRatio >= opts.minDiscountRatio;
  return { ok, saveYuan, saveRatio };
}
