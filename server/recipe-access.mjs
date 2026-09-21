/** Server-only recipe authorization. No browser flag grants access. */
import {LAUNCH} from '../public/launch-config.mjs';
import {HttpError,platformConfigured,passwordConfigured,session} from './platform.mjs';

export const RECIPE_ACCESS_MODES = Object.freeze(['registered','membership','membership-or-book']);
export const PRIVATE_RECIPE_COUNT = 499;

export function recipeAccessMode(env) {
  const mode=env.NUFI_RECIPE_ACCESS_MODE;
  if (!RECIPE_ACCESS_MODES.includes(mode)) {
    throw new HttpError(503,'Account recipe access has not been configured.');
  }
  return mode;
}

function requireReady(env) {
  const mode=recipeAccessMode(env);
  const otpReady=env.NUFI_EMAIL_OTP_READY==='true'&&env.NUFI_AUTH_CAPTCHA_READY==='true'&&!!env.TURNSTILE_SITE_KEY&&!!env.TURNSTILE_SECRET_KEY;
  if (!platformConfigured(env) || !(otpReady||passwordConfigured(env)) || env.NUFI_RECIPE_CONTENT_READY!=='true') {
    throw new HttpError(503,'Account recipes are not connected yet. The original 100 recipes remain free.');
  }
  return mode;
}

/** Eligibility alone, future activation, expired trials and malformed dates never grant access. */
export function activeLaunchTrial(status,now) {
  const entitlement=status?.entitlement;
  if (entitlement?.status!=='active' || typeof entitlement.activated_at!=='string' ||
      typeof entitlement.expires_at!=='string' || !Number.isFinite(now)) return false;
  const starts=Date.parse(entitlement.activated_at),ends=Date.parse(entitlement.expires_at);
  return Number.isFinite(starts) && Number.isFinite(ends) &&
    starts>=Date.parse(LAUNCH.at) && starts<=now && now<ends;
}

/**
 * The only current membership adapter is the existing launch-trial ledger.
 * Paid membership and book purchases are deliberately unsupported until their
 * authoritative server integrations exist. User metadata is never consulted.
 */
export async function authorizeRestrictedRecipes(req,res,{env=process.env,fetcher=fetch,now=Date.now}={}) {
  const mode=requireReady(env);
  const {user,api}=await session(req,res,env,fetcher);
  if (user.is_anonymous===true || !user.email || !user.email_confirmed_at) {
    throw new HttpError(401,'Sign in with a verified email account to open this recipe.');
  }
  if (mode==='registered') return {api,user,mode,evidence:'verified-account'};

  const timestamp=now();
  if (!Number.isFinite(timestamp) || env.NUFI_APP_ACCESS_READY!=='true' || timestamp<Date.parse(LAUNCH.at)) {
    throw new HttpError(503,'Membership recipe access is not open yet.');
  }
  const status=await api('/rest/v1/rpc/nufi_trial_status',{
    method:'POST',service:true,payload:{actor:user.id},
  });
  if (activeLaunchTrial(status,timestamp)) return {api,user,mode,evidence:'active-launch-trial'};

  // Do not infer paid or purchased access from caller input, signup or eligibility.
  throw new HttpError(403,'This account does not have confirmed access to these recipes.');
}

export function validRecipeId(value) {
  return typeof value==='string' && /^[a-z0-9][a-z0-9-]{0,79}$/.test(value) &&
    !['constructor','prototype','__proto__'].includes(value);
}

/** Fail closed if the private storage response does not have the promised shape. */
export function readPrivateRows(rows,freeIds,{expectedId=null,expectedCount=null}={}) {
  if (!Array.isArray(rows) || rows.length>1000 || (expectedId && rows.length>1) ||
      (expectedCount!==null && rows.length!==expectedCount)) {
    throw new HttpError(503,'The account recipe catalogue could not be confirmed.');
  }
  const seen=new Set();
  return rows.map(row=>{
    const recipe=row?.payload;
    if (!validRecipeId(row?.id) || freeIds.has(row.id) || seen.has(row.id) ||
        (expectedId && row.id!==expectedId) || !recipe || typeof recipe!=='object' ||
        Array.isArray(recipe) || recipe.id!==row.id || typeof recipe.name!=='string' ||
        !['published','held'].includes(row.publication_status) || recipe.publicationStatus!==row.publication_status ||
        !recipe.name.trim() || !Array.isArray(recipe.ingredients) || !recipe.ingredients.length ||
        !Array.isArray(recipe.steps) || !recipe.steps.length ||
        !recipe.steps.every(step=>typeof step==='string' && step.trim())) {
      throw new HttpError(503,'The account recipe catalogue could not be confirmed.');
    }
    seen.add(row.id);
    return recipe;
  });
}
