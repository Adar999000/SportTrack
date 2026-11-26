import { IS_DEMO } from './env';

/**
 * URL of the Apps Script web app (see apps-script/Code.gs). Not a secret.
 * Override at build time with VITE_API_URL (an empty string = local-only mode).
 * The single-file preview build is always local-only (its host blocks outside requests).
 */
const DEPLOYED = 'https://script.google.com/macros/s/AKfycbwPkm18f395SR3y5PYu6DpoV5g-VXJ7mihJaQaafo4YYL2qT6C3lTa5Ink7iMT6kdpu/exec';

export const API_URL: string = IS_DEMO ? '' : ((import.meta.env.VITE_API_URL as string | undefined) ?? DEPLOYED);
