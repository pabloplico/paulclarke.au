const WEIGHTS = [10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19];

export function isValidAbn(abn: string): boolean {
  const clean = abn.replace(/\s/g, '');
  if (!/^\d{11}$/.test(clean)) return false;

  const digits = clean.split('').map(Number);
  // Subtract 1 from the first digit
  digits[0]! -= 1;

  const sum = digits.reduce((acc, d, i) => acc + d * WEIGHTS[i]!, 0);
  return sum % 89 === 0;
}
