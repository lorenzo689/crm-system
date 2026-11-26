/**
 * Log-safe form of an e-mail address: first character of the local part and
 * the domain ("a***@example.com"). Enough to correlate a delivery problem,
 * not enough to identify the recipient from the log alone.
 */
export function maskEmail(address: string): string {
  const at = address.lastIndexOf('@');
  if (at <= 0) return '***';
  return `${address[0]}***${address.slice(at)}`;
}
