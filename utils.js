/** Format a number as a currency string. */
export function formatCurrency(value, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
  }).format(value);
}

/** Debounce a function call. */
export function debounce(fn, delay = 300) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

export const randomInt = (min, max) =>
  Math.floor(Math.random() * (max - min + 1)) + min;
