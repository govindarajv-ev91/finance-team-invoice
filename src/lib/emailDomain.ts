export const REQUIRED_EMAIL_DOMAIN = 'ev91riderz.com'

export function isAllowedEmail(email: string): boolean {
  const normalized = email.trim().toLowerCase()
  const parts = normalized.split('@')
  return parts.length === 2 && parts[0].length > 0 && parts[1] === REQUIRED_EMAIL_DOMAIN
}

export const REQUIRED_EMAIL_MESSAGE = `Only @${REQUIRED_EMAIL_DOMAIN} email addresses are allowed.`
