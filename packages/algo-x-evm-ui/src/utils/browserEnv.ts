/**
 * Heuristic for wallet-embedded browser detection.
 * 
 * Is the page running inside a wallet's in-app browser? 
 * 
 * Based on user agent, so it can be wrong:
 * 
 *  - False positive (regular browser flagged as in-app): still works - they just verify
 *    in the same tab (with restore) rather than a new one; swaps get verify blocked
 *    (rare - needs a wallet user agent token).
 *  - False negative (unrecognized in-app browser): pending sign will probably be lost on verify.
 */
export function isWalletInAppBrowser(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (/metamask/i.test(ua)) return true
  if (/rabby/i.test(ua)) return true // keeps the "Safari" token — missed by the generic iOS check below
  if (/coinbase/i.test(ua)) return true
  if (/Android/i.test(ua) && /\bwv\b/i.test(ua)) return true
  if (/iPhone|iPad|iPod/i.test(ua) && !/Safari/i.test(ua)) return true
  return false
}
