import { orderFulfillments } from '@wix/ecom';

/**
 * Fires when an order's fulfillments are created, updated or deleted
 * (event `wix.ecom.v1.fulfillments_updated`). Requires the Read Orders permission.
 *
 * Spike: log what arrives so we can confirm delivery and payload shape on the
 * dev site. Later this starts the return window clock and triggers
 * "shipped" notifications. Wix may deliver an event more than once, so
 * persistence must be idempotent on the event id.
 */
export default orderFulfillments.onFulfillmentsUpdated((event) => {
  const { orderId, fulfillments } = event.entity;

  console.log('[after-buy-ops] fulfillments updated', {
    eventId: event.metadata?._id,
    orderId,
    fulfillments: (fulfillments ?? []).map((f) => ({
      id: f._id,
      status: f.status,
      trackingNumber: f.trackingInfo?.trackingNumber,
      carrier: f.trackingInfo?.shippingProvider,
    })),
  });
});
