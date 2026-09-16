/** Exact source wording at original yield; no hidden conversions when scaling. */
export function ingredientText(i) {
  if (i.sourceText && (i.quantity === i.sourceQuantity || i.quantity === null)) return i.sourceText;
  const n = i.quantity === null ? '' : Number(i.quantity.toFixed(2)).toLocaleString('en-GB', {maximumFractionDigits:2});
  return [n, i.unit, i.name].filter(Boolean).join(' ');
}
export function sourceHint(i) {
  if (i.quantity === null && i.scaleFactor && i.scaleFactor !== 1) return `Amount kept as printed. Recipe scaled ×${Number(i.scaleFactor.toFixed(2))}; choose this amount explicitly in your own version.`;
  return i.note || '';
}
export function timeLabel(r) {
  return Number.isFinite(r.prepMinutes) && Number.isFinite(r.cookMinutes)
    ? `${r.prepMinutes+r.cookMinutes} min${r.waitMinutes ? ' + resting' : ''}` : 'Timings in the method';
}
