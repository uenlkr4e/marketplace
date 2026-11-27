import { app } from '@wix/custom-extensions';
import returns from './extensions/dashboard/pages/returns/returns.extension.ts';
import settings from './extensions/dashboard/pages/settings/settings.extension.ts';
import orderLookup from './extensions/site/widgets/order-lookup/order-lookup.extension.ts';
import fulfillmentsUpdated from './extensions/backend/events/fulfillments-updated/fulfillments-updated.extension.ts';

export default app().use(returns).use(settings).use(orderLookup).use(fulfillmentsUpdated);
