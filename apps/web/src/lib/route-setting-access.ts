export function canUseRouteSetting(email: string): boolean {
  const enabled = process.env.AI_ROUTE_SETTING_ENABLED === 'true' ||
    (process.env.NODE_ENV !== 'production' && process.env.AI_ROUTE_SETTING_ENABLED !== 'false');
  if (!enabled) return false;

  const allowedEmails = (process.env.AI_ROUTE_SETTING_ALLOWED_EMAILS ?? '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowedEmails.includes('*') ||
    allowedEmails.includes(email.toLowerCase()) ||
    (process.env.NODE_ENV !== 'production' && allowedEmails.length === 0);
}
