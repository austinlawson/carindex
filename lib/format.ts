export function formatCurrency(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0
  }).format(value);
}

export function formatMileage(value: number) {
  return `${new Intl.NumberFormat("en-US").format(value)} mi`;
}
