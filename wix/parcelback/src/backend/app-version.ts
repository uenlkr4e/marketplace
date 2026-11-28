import { auth } from '@wix/essentials';
import { appInstances } from '@wix/app-management';

const getAppInstance = auth.elevate(appInstances.getAppInstance);

/**
 * The Parcelback version installed on the calling site (for example "1.3.0"),
 * shown on the Settings page so merchants can quote it to support.
 * Null if Wix doesn't return it; never fails the caller's request.
 */
export async function getInstalledVersion(): Promise<string | null> {
  try {
    const { instance } = await getAppInstance();
    // Wix returns a range like "^1.3.0"; merchants just need the number.
    return instance?.appVersion?.replace(/^[\^~]/, '') || null;
  } catch (e) {
    console.warn('[parcelback] app version lookup failed:', e instanceof Error ? e.message : e);
    return null;
  }
}
