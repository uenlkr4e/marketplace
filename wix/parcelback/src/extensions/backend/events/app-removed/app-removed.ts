import { appInstances } from '@wix/app-management';
import { deleteStoreData } from '../../../../backend/db';

/**
 * Fires when a store uninstalls Parcelback. Deletes the store's data, as the
 * privacy policy promises (site/privacy.html, "How long we keep it").
 * Requires the Manage Your App permission. Safe to run twice: a repeated
 * event finds nothing left to delete.
 */
export default appInstances.onAppInstanceRemoved(async (event) => {
  const instanceId = event.metadata?.instanceId;
  if (!instanceId) {
    console.error('[parcelback] app removed without an instance ID; nothing deleted');
    return;
  }
  const requests = await deleteStoreData(instanceId);
  console.log('[parcelback] app removed; store data deleted', { instanceId, requests });
});
