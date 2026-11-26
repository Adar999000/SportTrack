import { IS_DEMO } from './env';

/**
 * URL of the Apps Script web app (see apps-script/). Not a secret.
 * Override at build time with VITE_API_URL (an empty string = local-only mode).
 * The single-file preview build is always local-only (its host blocks outside requests).
 */
const DEPLOYED = 'https://script.google.com/macros/s/AKfycbxFzLGWJ1VEzSpRyWsiTsfs1ygf_V6dnluycTewfFLJY9I2NNS7PvKCxxG8P_TmBUVK/exec';

export const API_URL: string = IS_DEMO ? '' : ((import.meta.env.VITE_API_URL as string | undefined) ?? DEPLOYED);
