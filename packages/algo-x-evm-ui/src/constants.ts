/**
 * Canonical xChain portal origin. Must match the portal's deployed domain
 * (portal wrangler.toml `custom_domain`); the `/verify` + `/docs` paths built
 * from it must match the portal's routes.
 */
export const XCHAIN_PORTAL_ORIGIN = 'https://xchain.algorand.co'

export const VERIFY_PORTAL_URL = `${XCHAIN_PORTAL_ORIGIN}/verify`

export const DOCS_PORTAL_URL = `${XCHAIN_PORTAL_ORIGIN}/docs`
