import { httpClient } from '@wix/essentials';
import { RETURN_REASONS } from '../../../../shared/returns';

type Shipment = {
  carrier: string | null;
  trackingNumber: string | null;
  trackingLink: string | null;
};

type LineItem = { id: string; name: string; quantity: number; returnableQuantity: number };

type LookupResult = {
  number: string;
  createdDate: string;
  fulfillmentStatus: string;
  lineItems: LineItem[];
  shipments: Shipment[];
  returns: {
    eligible: boolean;
    reason: string | null;
    windowEndsAt: string | null;
    requests: { rmaNumber: string; status: string; items: { name: string; quantity: number }[] }[];
  };
};

type Customer = { orderNumber: string; email: string };

const DEFAULT_TITLE = 'Track your order';
const GENERIC_ERROR = 'Something went wrong. Please try again.';
const STATUS_LABELS: Record<string, string> = {
  REQUESTED: 'Requested',
  APPROVED: 'Approved, please send the items back',
  REJECTED: 'Not approved',
  RECEIVED: 'Received, refund in progress',
  REFUNDING: 'Refund in progress',
  REFUNDED: 'Refunded',
};

const STYLES = `
  order-lookup { display: block; font: inherit; color: inherit; }
  order-lookup .abo-card { padding: 16px; border: 1px solid #ddd; border-radius: 8px; }
  order-lookup form { display: grid; gap: 8px; }
  order-lookup input, order-lookup button, order-lookup select, order-lookup textarea { font: inherit; padding: 8px 10px; }
  order-lookup button { cursor: pointer; }
  order-lookup .abo-error { color: #b00020; }
  order-lookup .abo-muted { opacity: 0.75; }
  order-lookup .abo-row { display: flex; gap: 8px; align-items: center; }
  order-lookup .abo-row label { flex: 1; }
  order-lookup ul { padding-left: 18px; }
`;

// Builds an element; all text goes through textContent, never parsed as HTML.
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  children: (Node | string)[] = [],
): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function errorText(message: string) {
  const error = el('p', { className: 'abo-error', textContent: message });
  error.setAttribute('role', 'alert');
  return error;
}

async function post(path: string, payload: unknown) {
  const response = await httpClient.fetchWithAuth(`${new URL(import.meta.url).origin}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return { ok: response.ok, body: await response.json() };
}

class OrderLookup extends HTMLElement {
  static get observedAttributes() {
    return ['display-name'];
  }

  connectedCallback() {
    this.renderForm();
  }

  attributeChangedCallback() {
    if (this.isConnected) this.renderForm();
  }

  private mount(...children: Node[]) {
    this.replaceChildren(el('style', { textContent: STYLES }), el('div', { className: 'abo-card' }, children));
  }

  private renderForm(message = '') {
    const orderNumber = el('input', { name: 'orderNumber', placeholder: 'Order number', inputMode: 'numeric', required: true });
    const email = el('input', { name: 'email', type: 'email', placeholder: 'Email used at checkout', required: true });
    const submit = el('button', { type: 'submit', textContent: 'Find my order' });
    const form = el('form', {}, [orderNumber, email, submit]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      submit.disabled = true;
      submit.textContent = 'Searching…';
      void this.lookup({ orderNumber: orderNumber.value, email: email.value });
    });

    this.mount(el('h2', { textContent: this.getAttribute('display-name') || DEFAULT_TITLE }), form);
  }

  private async lookup(customer: Customer) {
    try {
      const { ok, body } = await post('order-lookup', customer);
      if (ok) {
        this.renderResult(customer, body as LookupResult);
      } else {
        this.renderForm(body.error ?? GENERIC_ERROR);
      }
    } catch {
      this.renderForm(GENERIC_ERROR);
    }
  }

  private renderResult(customer: Customer, order: LookupResult, notice?: Node) {
    const items = order.lineItems.map((i) => el('li', { textContent: `${i.name} × ${i.quantity}` }));

    const shipments = order.shipments.length
      ? order.shipments.map((s) => {
          const label = [s.carrier, s.trackingNumber].filter(Boolean).join(' · ') || 'Shipped';
          const li = el('li', { textContent: label });
          if (s.trackingLink?.startsWith('https://') || s.trackingLink?.startsWith('http://')) {
            li.append(' — ', el('a', { href: s.trackingLink, target: '_blank', rel: 'noopener noreferrer', textContent: 'Track shipment' }));
          }
          return li;
        })
      : [el('li', { textContent: 'Not shipped yet.' })];

    const returnsSection: Node[] = [el('h3', { textContent: 'Returns' })];
    if (notice) returnsSection.push(notice);
    if (order.returns.requests.length) {
      returnsSection.push(
        el(
          'ul',
          {},
          order.returns.requests.map((r) =>
            el('li', {
              textContent: `${r.rmaNumber}: ${r.items.map((i) => `${i.name} × ${i.quantity}`).join(', ')} (${STATUS_LABELS[r.status] ?? r.status})`,
            }),
          ),
        ),
      );
    }
    if (order.returns.eligible) {
      if (order.returns.windowEndsAt) {
        returnsSection.push(
          el('p', { className: 'abo-muted', textContent: `You can start a return until ${new Date(order.returns.windowEndsAt).toLocaleDateString()}.` }),
        );
      }
      const start = el('button', { type: 'button', textContent: 'Start a return' });
      start.addEventListener('click', () => this.renderReturnForm(customer, order));
      returnsSection.push(start);
    } else if (order.returns.reason) {
      returnsSection.push(el('p', { className: 'abo-muted', textContent: order.returns.reason }));
    }

    const back = el('button', { type: 'button', textContent: 'Look up another order' });
    back.addEventListener('click', () => this.renderForm());

    this.mount(
      el('h2', { textContent: `Order #${order.number}` }),
      el('p', { textContent: `Placed ${new Date(order.createdDate).toLocaleDateString()} · Status: ${order.fulfillmentStatus}` }),
      el('h3', { textContent: 'Items' }),
      el('ul', {}, items),
      el('h3', { textContent: 'Shipments' }),
      el('ul', {}, shipments),
      ...returnsSection,
      el('p'),
      back,
    );
  }

  private renderReturnForm(customer: Customer, order: LookupResult, message = '') {
    const rows = order.lineItems
      .filter((i) => i.returnableQuantity > 0)
      .map((item) => {
        const quantity = el('select', { name: `qty-${item.id}` }, [
          el('option', { value: '0', textContent: "Don't return" }),
          ...Array.from({ length: item.returnableQuantity }, (_, n) =>
            el('option', { value: String(n + 1), textContent: `Return ${n + 1}` }),
          ),
        ]);
        quantity.dataset.lineItemId = item.id;
        return { quantity, row: el('div', { className: 'abo-row' }, [el('label', { textContent: item.name }), quantity]) };
      });

    const reason = el('select', { name: 'reason', required: true }, [
      el('option', { value: '', textContent: 'Reason for return' }),
      ...RETURN_REASONS.map((r) => el('option', { value: r, textContent: r })),
    ]);
    const note = el('textarea', { name: 'note', placeholder: 'Anything else we should know? (optional)', maxLength: 1000, rows: 3 });
    const submit = el('button', { type: 'submit', textContent: 'Submit return request' });
    const cancel = el('button', { type: 'button', textContent: 'Cancel' });
    cancel.addEventListener('click', () => this.renderResult(customer, order));

    const form = el('form', {}, [...rows.map((r) => r.row), reason, note, submit, cancel]);
    if (message) form.append(errorText(message));

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const items = rows
        .map((r) => ({ lineItemId: r.quantity.dataset.lineItemId!, quantity: Number(r.quantity.value) }))
        .filter((i) => i.quantity > 0);
      if (!items.length) {
        this.renderReturnForm(customer, order, 'Please choose at least one item to return.');
        return;
      }
      submit.disabled = true;
      submit.textContent = 'Submitting…';
      void this.submitReturn(customer, order, { items, reason: reason.value, note: note.value });
    });

    this.mount(el('h2', { textContent: `Return items from order #${order.number}` }), form);
  }

  private async submitReturn(
    customer: Customer,
    order: LookupResult,
    request: { items: { lineItemId: string; quantity: number }[]; reason: string; note: string },
  ) {
    try {
      const { ok, body } = await post('return-request', { ...customer, ...request });
      if (!ok) {
        this.renderReturnForm(customer, order, body.error ?? GENERIC_ERROR);
        return;
      }
      // Reload so quantities and the request list reflect the new return.
      const refreshed = await post('order-lookup', customer);
      const confirmation = el('p', {
        textContent: `Return request ${body.rmaNumber} received. The store will review it; you can check its status here any time.`,
      });
      confirmation.setAttribute('role', 'status');
      if (refreshed.ok) {
        this.renderResult(customer, refreshed.body as LookupResult, confirmation);
      } else {
        this.mount(confirmation);
      }
    } catch {
      this.renderReturnForm(customer, order, GENERIC_ERROR);
    }
  }
}

export default OrderLookup;
