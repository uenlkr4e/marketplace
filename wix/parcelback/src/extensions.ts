import { app } from '@wix/custom-extensions';
import sidebarCategory from './extensions/dashboard/sidebar-categories/parcelback/parcelback.extension.ts';
import returns from './extensions/dashboard/pages/returns/returns.extension.ts';
import settings from './extensions/dashboard/pages/settings/settings.extension.ts';
import orderLookup from './extensions/site/widgets/order-lookup/order-lookup.extension.ts';
import fulfillmentsUpdated from './extensions/backend/events/fulfillments-updated/fulfillments-updated.extension.ts';
import appRemoved from './extensions/backend/events/app-removed/app-removed.extension.ts';

export default app().use(sidebarCategory).use(returns).use(settings).use(orderLookup).use(fulfillmentsUpdated).use(appRemoved);
