export function matchBrand(text: string, brands: string[]): string | null {
  for (const brand of brands) {
    if (text.includes(brand)) return brand;
  }
  return null;
}

export function withCity<T extends object>(value: T, city: string): T & { city: string } {
  return { ...value, city };
}
