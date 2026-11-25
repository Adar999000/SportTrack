/** True in the single-file preview build (`npm run build:artifact`): no service worker, sample data. */
export const IS_DEMO = import.meta.env.MODE === 'artifact';
