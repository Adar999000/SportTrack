/**
 * URL of the Apps Script web app (see apps-script/Code.gs). Not a secret.
 * Empty = local-only mode (no accounts, data stays on the device).
 * Can also be set at build time with VITE_API_URL.
 */
export const API_URL: string = (import.meta.env.VITE_API_URL as string | undefined) || '';
