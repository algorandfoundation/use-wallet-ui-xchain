/**
 * Transport utilities for the xChain portal independent transaction verification.
 */

import { VERIFY_PORTAL_URL } from '../constants'

/** Convert standard base64 to base64url (RFC 4648 §5) */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** Convert base64url back to standard base64 for `atob` */
function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/')
  const pad = b64.length % 4
  return pad ? b64 + '='.repeat(4 - pad) : b64
}

/**
 * Encode msgpack transactions into a URL-safe string.
 * Each transaction gets base64url-encoded, joined with `:`.
 *
 * @param txnBytes - Per-transaction msgpack bytes (via algosdk's `txn.toByte()`).
 * @returns Single string encoding the entire group, suitable for a URL hash.
 */
export function encodeTxnGroup(txnBytes: Uint8Array[]): string {
  return txnBytes
    .map((bytes) => toBase64Url(btoa(Array.from(bytes, (b) => String.fromCharCode(b)).join(''))))
    .join(':')
}

/**
 * Decode a base64url-encoded txn group string back into per-txn msgpack
 * byte arrays. Inverse of `encodeTxnGroup`.
 *
 * Throws if `payload` is empty or malformed. Consumers should handle decode
 * failures with try/catch.
 */
export function decodeTxnGroup(payload: string): Uint8Array[] {
  if (!payload) throw new Error('Transaction payload is empty')

  return payload.split(':').map((part) => {
    if (!part) throw new Error('Transaction payload contains an empty transaction')
    return Uint8Array.from(atob(fromBase64Url(part)), (c) => c.charCodeAt(0))
  })
}

/**
 * Build the full portal verification URL for a transaction group.
 * The encoded payload is placed in the hash fragment; not sent to the server.
 *
 * @param txnBytes - Per-transaction msgpack bytes (via algosdk's `txn.toByte()`).
 */
export function buildVerifyUrl(txnBytes: Uint8Array[]): string {
  return `${VERIFY_PORTAL_URL}#${encodeTxnGroup(txnBytes)}`
}
