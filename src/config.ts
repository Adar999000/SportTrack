import { IS_DEMO } from './env';

/**
 * URL of the Apps Script web app (see apps-script/Code.gs). Not a secret.
 * Override at build time with VITE_API_URL (an empty string = local-only mode).
 * The single-file preview build is always local-only (its host blocks outside requests).
 */
const DEPLOYED = 'https://script.google.com/macros/s/AKfycby-HbZbvUlu4_CEEsmOfUwqULGLRG_k7bF-iCYQ36rsjbTMEbp0HNnGW96O3t2hIIhx/exec';

export const API_URL: string = IS_DEMO ? '' : ((import.meta.env.VITE_API_URL as string | undefined) ?? DEPLOYED);
