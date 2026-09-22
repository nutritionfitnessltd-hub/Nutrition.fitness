/** Safe readiness metadata. Never return setting values, provider messages or credentials. */
import {platform, platformConfigured, passwordLoginConfigured} from './platform.mjs';
import {provisionedLoginAvailable} from './provisioned-login.mjs';

const REQUIRED = Object.freeze(['SITE_URL', 'SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY']);

export async function provisionedReadiness(env, fetcher = fetch) {
  const missingSettings = REQUIRED.filter(key => typeof env[key] !== 'string' || !env[key].trim());
  if (missingSettings.length) return {ready: false, state: 'missing-settings', missingSettings};
  if (!platformConfigured(env)) return {ready: false, state: 'invalid-settings'};
  if (!passwordLoginConfigured(env)) return {ready: false, state: 'account-permissions-disabled'};
  if ((env.TURNSTILE_SITE_KEY || env.TURNSTILE_SECRET_KEY) &&
      !(env.TURNSTILE_SITE_KEY && env.TURNSTILE_SECRET_KEY && env.NUFI_AUTH_CAPTCHA_READY === 'true')) {
    return {ready: false, state: 'security-check-incomplete'};
  }
  try {
    // Existing zero-row read: preserves credential/RLS/limiter checks and never writes data.
    await provisionedLoginAvailable(platform(env, fetcher));
    return {ready: true, state: 'ready'};
  } catch (error) {
    const status = error?.upstreamStatus;
    const state = status === 401 || status === 403 ? 'server-access-denied' :
      status === 404 || error?.upstreamCode === 'PGRST205' ? 'database-not-ready' : 'connection-unavailable';
    return {ready: false, state};
  }
}
