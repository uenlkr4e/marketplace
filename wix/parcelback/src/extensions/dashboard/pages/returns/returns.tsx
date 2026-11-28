import { type FC, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge,
  Box,
  Button,
  Card,
  Checkbox,
  CustomModalLayout,
  EmptyState,
  FormField,
  Input,
  InputArea,
  Loader,
  Modal,
  Page,
  RadioGroup,
  SectionHelper,
  Table,
  Text,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { dashboard } from '@wix/dashboard';
import { STORE_CREDIT_VALID_DAYS, type RefundPlan, type ReturnRequest, type ReturnStatus } from '../../../../shared/returns';
import { applyAction, creditRequest, listReturnRequests, planRefund, refundRequest } from './return-actions';

const STATUS_SKIN: Record<ReturnStatus, 'warning' | 'general' | 'danger' | 'success' | 'neutral'> = {
  REQUESTED: 'warning',
  APPROVED: 'general',
  RECEIVED: 'general',
  REFUNDING: 'neutral',
  REJECTED: 'danger',
  REFUNDED: 'success',
  CREDITED: 'success',
};
const OPEN: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDING'];

// Withdrawals must be refunded within 14 days of the customer's declaration
// (the store may wait until the items are back).
const WITHDRAWAL_REFUND_DAYS = 14;
const refundDueBy = (r: ReturnRequest) =>
  new Date(new Date(r.createdAt).getTime() + WITHDRAWAL_REFUND_DAYS * 24 * 60 * 60 * 1000).toLocaleDateString();
const kindLabel = (r: ReturnRequest) => (r.kind === 'WITHDRAWAL' ? 'withdrawal' : 'return');

// CSV of every request, including its status history, for the merchant's records.
function exportCsv(requests: ReturnRequest[]) {
  const header = [
    'Reference', 'Type', 'Order', 'Customer name', 'Customer email', 'Items', 'Reason', 'Customer note',
    'Status', 'Submitted (UTC)', 'Last updated (UTC)', 'Merchant note', 'Refunded amount', 'Store credit', 'Store credit code', 'Currency',
    'History',
  ];
  const rows = requests.map((r) => [
    r.rmaNumber,
    r.kind === 'WITHDRAWAL' ? 'Withdrawal' : 'Return',
    r.orderNumber,
    r.customerName ?? '',
    r.customerEmail,
    r.items.map((i) => `${i.name} x ${i.quantity}`).join('; '),
    r.reason,
    r.customerNote,
    r.status,
    r.createdAt,
    r.updatedAt,
    r.merchantNote ?? '',
    r.refundedAmount == null ? '' : r.refundedAmount.toFixed(2),
    r.credit ? r.credit.amount.toFixed(2) : '',
    r.credit?.code ?? '',
    r.currency,
    r.history.map((h) => `${h.status} ${h.at}${h.note ? ` (${h.note})` : ''}`).join('; '),
  ]);
  // Quote every field; a leading quote mark stops spreadsheets from running formulas.
  const cell = (value: string) => `"${(/^[=+\-@]/.test(value) ? `'${value}` : value).replace(/"/g, '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(cell).join(',')).join('\r\n');
  const link = document.createElement('a');
  link.href = URL.createObjectURL(new Blob(['\uFEFF', csv], { type: 'text/csv;charset=utf-8' }));
  link.download = `parcelback-requests-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

// restock: lineItemId -> how many go back into stock (defaults to everything returned).
type RefundDraft = {
  request: ReturnRequest;
  plan: RefundPlan;
  amount: string;
  restock: Record<string, number>;
  notify: boolean;
  // Money back to the original payment, or store credit (a single-use discount code).
  payout: 'refund' | 'credit';
};
// Rejecting requires a reason; it's shown to the customer in the rejection email.
type RejectDraft = { request: ReturnRequest; reason: string };
const MAX_REASON_LENGTH = 1000;

const ReturnsPage: FC = () => {
  const [requests, setRequests] = useState<ReturnRequest[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refund, setRefund] = useState<RefundDraft | null>(null);
  const [rejectDraft, setRejectDraft] = useState<RejectDraft | null>(null);

  const load = useCallback(async () => {
    try {
      setRequests(await listReturnRequests());
    } catch (e) {
      setRequests([]);
      dashboard.showToast({ message: `Couldn't load return requests: ${errorMessage(e)}`, type: 'error' });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const replace = (updated: ReturnRequest) =>
    setRequests((list) => list?.map((r) => (r.id === updated.id ? updated : r)) ?? null);

  const run = async (request: ReturnRequest, action: () => Promise<ReturnRequest>, success: string) => {
    setBusyId(request.id);
    try {
      replace(await action());
      dashboard.showToast({ message: success, type: 'success' });
    } catch (e) {
      dashboard.showToast({ message: errorMessage(e), type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const openRefund = async (request: ReturnRequest) => {
    setBusyId(request.id);
    try {
      const plan = await planRefund(request);
      const restock = Object.fromEntries(request.items.map((i) => [i.lineItemId, i.quantity]));
      setRefund({ request, plan, amount: request.requestedAmount.toFixed(2), restock, notify: true, payout: 'refund' });
    } catch (e) {
      dashboard.showToast({ message: `Couldn't check the payment: ${errorMessage(e)}`, type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmRefund = async () => {
    if (!refund || (refund.payout === 'refund' && refund.plan.kind === 'none')) return;
    const { request, plan, restock, notify } = refund;
    const amount = Number(refund.amount);
    setRefund(null);
    if (refund.payout === 'credit') {
      await run(
        request,
        () => creditRequest(request, { amount, notifyCustomer: notify }),
        `${request.rmaNumber} settled with store credit.`,
      );
      return;
    }
    await run(
      request,
      () =>
        refundRequest(request, {
          amount,
          restockItems: Object.entries(restock).map(([lineItemId, quantity]) => ({ lineItemId, quantity })),
          notifyCustomer: notify,
        }),
      plan.kind === 'manual' ? `${request.rmaNumber} recorded as refunded.` : `${request.rmaNumber} refunded.`,
    );
  };

  const confirmReject = async () => {
    if (!rejectDraft || !rejectDraft.reason.trim()) return;
    const { request, reason } = rejectDraft;
    setRejectDraft(null);
    await run(request, () => applyAction(request, 'reject', reason.trim()), `${request.rmaNumber} rejected.`);
  };

  const visible = useMemo(
    () => (requests ?? []).filter((r) => filter === 'all' || OPEN.includes(r.status)),
    [requests, filter],
  );

  const actions = (r: ReturnRequest) => {
    if (busyId === r.id) return <Loader size="tiny" />;
    return (
      <Box direction="vertical" gap="SP2" align="right">
        {r.status === 'REQUESTED' && (
          <>
            <Button size="small" onClick={() => run(r, () => applyAction(r, 'approve'), `${r.rmaNumber} approved.`)}>
              Approve
            </Button>
            <Button
              size="small"
              skin="destructive"
              priority="secondary"
              onClick={() => setRejectDraft({ request: r, reason: '' })}
            >
              Reject
            </Button>
          </>
        )}
        {r.status === 'APPROVED' && (
          <Button
            size="small"
            priority="secondary"
            onClick={() => run(r, () => applyAction(r, 'receive'), `${r.rmaNumber} marked as received.`)}
          >
            Mark received
          </Button>
        )}
        {(r.status === 'APPROVED' || r.status === 'RECEIVED') && (
          <Button size="small" onClick={() => openRefund(r)}>
            Refund
          </Button>
        )}
      </Box>
    );
  };

  const amountValid = refund !== null && /^\d+(\.\d{1,2})?$/.test(refund.amount) && Number(refund.amount) > 0;

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="Returns"
          subtitle="Return requests and EU withdrawals your customers submit from the order lookup widget."
          actionsBar={
            <Box gap="SP2">
              <Button priority="secondary" disabled={!requests?.length} onClick={() => requests && exportCsv(requests)}>
                Export CSV
              </Button>
              <Button priority="secondary" onClick={() => load()}>
                Refresh
              </Button>
            </Box>
          }
        />
        <Page.Content>
          <Card>
            <Card.Header
              title="Return requests"
              suffix={
                <Box gap="SP1">
                  {(['open', 'all'] as const).map((value) => (
                    <Button
                      key={value}
                      size="small"
                      priority={filter === value ? 'primary' : 'secondary'}
                      onClick={() => setFilter(value)}
                    >
                      {value === 'open' ? 'Open' : 'All'}
                    </Button>
                  ))}
                </Box>
              }
            />
            {requests === null ? (
              <Card.Content>
                <Box align="center" padding="SP6">
                  <Loader />
                </Box>
              </Card.Content>
            ) : visible.length === 0 ? (
              <Card.Content>
                <EmptyState
                  title={filter === 'open' ? 'No open return requests' : 'No return requests yet'}
                  subtitle="Requests appear here when customers start a return from the order lookup widget."
                  skin="section"
                />
              </Card.Content>
            ) : (
              <Table
                data={visible}
                columns={[
                  {
                    title: 'Reference',
                    width: '15%',
                    render: (r) => (
                      <Box direction="vertical" gap="SP1">
                        <Text weight="bold">{r.rmaNumber}</Text>
                        <Text size="tiny" secondary>{`Order #${r.orderNumber}`}</Text>
                        {r.kind === 'WITHDRAWAL' && (
                          <Badge size="tiny" skin="standard">
                            Withdrawal
                          </Badge>
                        )}
                      </Box>
                    ),
                  },
                  {
                    title: 'Customer',
                    width: '20%',
                    render: (r) => (
                      <Box direction="vertical">
                        {r.customerName ? <Text size="small">{r.customerName}</Text> : null}
                        {/* Long email addresses wrap instead of spilling into the next column. */}
                        <Text size="small">
                          <span style={{ overflowWrap: 'anywhere' }}>{r.customerEmail}</span>
                        </Text>
                      </Box>
                    ),
                  },
                  {
                    title: 'Items',
                    width: '23%',
                    render: (r) => (
                      <Box direction="vertical">
                        {r.items.map((i) => (
                          <Text key={i.lineItemId} size="small">{`${i.name} × ${i.quantity}`}</Text>
                        ))}
                        <Text size="tiny" secondary>
                          {r.reason}
                        </Text>
                        {r.customerNote ? (
                          <Text size="tiny" secondary>{`“${r.customerNote}”`}</Text>
                        ) : null}
                        {r.merchantNote ? (
                          <Text size="tiny" weight="bold">{`Rejection reason: ${r.merchantNote}`}</Text>
                        ) : null}
                      </Box>
                    ),
                  },
                  {
                    title: 'Status',
                    width: '15%',
                    render: (r) => (
                      <Box direction="vertical" gap="SP1">
                        <Badge size="small" skin={STATUS_SKIN[r.status]}>
                          {r.status}
                        </Badge>
                        <Text size="small">
                          {r.status === 'REFUNDED' && r.refundedAmount != null
                            ? `${money(r.refundedAmount, r.currency)} refunded`
                            : r.credit
                              ? `${money(r.credit.amount, r.currency)} store credit`
                              : money(r.requestedAmount, r.currency)}
                        </Text>
                        {r.credit && <Text size="tiny" secondary>{`Code ${r.credit.code}`}</Text>}
                      </Box>
                    ),
                  },
                  {
                    title: 'Requested',
                    width: '13%',
                    render: (r) => (
                      <Box direction="vertical">
                        <Text size="small">
                          {new Date(r.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}
                        </Text>
                        {r.kind === 'WITHDRAWAL' && OPEN.includes(r.status) && (
                          <Text size="tiny" secondary>{`Refund due by ${refundDueBy(r)}`}</Text>
                        )}
                      </Box>
                    ),
                  },
                  { title: '', render: actions, width: '14%' },
                ]}
              >
                <Table.Content />
              </Table>
            )}
          </Card>
        </Page.Content>
      </Page>

      <Modal isOpen={rejectDraft !== null} onRequestClose={() => setRejectDraft(null)} shouldCloseOnOverlayClick>
        {rejectDraft && (
          <CustomModalLayout
            title={`Reject ${kindLabel(rejectDraft.request)} ${rejectDraft.request.rmaNumber}`}
            primaryButtonText="Reject"
            primaryButtonProps={{ disabled: !rejectDraft.reason.trim(), skin: 'destructive' }}
            primaryButtonOnClick={confirmReject}
            secondaryButtonText="Cancel"
            secondaryButtonOnClick={() => setRejectDraft(null)}
            onCloseButtonClick={() => setRejectDraft(null)}
            width="520px"
            content={
              <Box direction="vertical" gap="SP4">
                {rejectDraft.request.kind === 'WITHDRAWAL' && (
                  <SectionHelper skin="warning">
                    Customers in the EU can withdraw without giving a reason. Only reject if the withdrawal period has
                    ended or the items are exempt (for example, made-to-order items, or hygiene products the customer
                    unsealed after delivery).
                  </SectionHelper>
                )}
                <FormField label="Reason for rejecting" infoContent="Included in the email to the customer." required>
                  <InputArea
                    value={rejectDraft.reason}
                    onChange={(e) => setRejectDraft({ ...rejectDraft, reason: e.target.value })}
                    placeholder="e.g. The item was marked final sale at checkout."
                    rows={4}
                    maxLength={MAX_REASON_LENGTH}
                    hasCounter
                    autoFocus
                  />
                </FormField>
              </Box>
            }
          />
        )}
      </Modal>

      <Modal isOpen={refund !== null} onRequestClose={() => setRefund(null)} shouldCloseOnOverlayClick>
        {refund && (
          <CustomModalLayout
            title={`Settle ${refund.request.rmaNumber}`}
            primaryButtonText={
              refund.payout === 'credit' ? 'Issue store credit' : refund.plan.kind === 'manual' ? 'Record refund' : 'Refund'
            }
            primaryButtonProps={{ disabled: (refund.payout === 'refund' && refund.plan.kind === 'none') || !amountValid }}
            primaryButtonOnClick={confirmRefund}
            secondaryButtonText="Cancel"
            secondaryButtonOnClick={() => setRefund(null)}
            onCloseButtonClick={() => setRefund(null)}
            width="520px"
            content={
              <Box direction="vertical" gap="SP4">
                {refund.request.kind === 'WITHDRAWAL' ? (
                  <Text size="small" secondary>
                    Withdrawals are refunded to the original payment; store credit isn't offered for them.
                  </Text>
                ) : (
                  <RadioGroup
                    value={refund.payout}
                    onChange={(value) => setRefund({ ...refund, payout: value as RefundDraft['payout'] })}
                  >
                    <RadioGroup.Radio value="refund">Refund to the original payment</RadioGroup.Radio>
                    <RadioGroup.Radio value="credit">Store credit (single-use discount code)</RadioGroup.Radio>
                  </RadioGroup>
                )}

                {refund.payout === 'refund' && refund.plan.kind === 'automatic' && (
                  <Text>{`The money goes back to the customer's original payment (${refund.plan.method}).`}</Text>
                )}
                {refund.payout === 'refund' && refund.plan.kind === 'manual' && (
                  <SectionHelper skin="warning">
                    {`This order was paid with ${refund.plan.method || 'a manual payment method'}, which Wix can't refund automatically (${refund.plan.reason}). Send the money to the customer yourself; this only records the refund in Wix.`}
                  </SectionHelper>
                )}
                {refund.payout === 'refund' && refund.plan.kind === 'none' && (
                  <SectionHelper skin="danger">{`This order can't be refunded: ${refund.plan.reason}.`}</SectionHelper>
                )}
                {refund.payout === 'credit' && (
                  <Text>
                    {`The customer gets a discount code worth this amount, valid in your store for ${STORE_CREDIT_VALID_DAYS} days and usable once. Anything not spent on that order is lost. You can add a bonus to make credit more attractive than a refund.`}
                  </Text>
                )}

                <FormField
                  label={`${refund.payout === 'credit' ? 'Credit amount' : 'Refund amount'} (${refund.request.currency})`}
                  status={amountValid ? undefined : 'error'}
                  statusMessage={amountValid ? undefined : 'Enter an amount like 12.50'}
                >
                  <Input value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                </FormField>

                {refund.payout === 'refund' ? (
                  <Box direction="vertical" gap="SP1">
                    <Text weight="bold">Put back in stock</Text>
                    {refund.request.items.map((item) => {
                      const count = refund.restock[item.lineItemId] ?? 0;
                      const setCount = (n: number) =>
                        setRefund({ ...refund, restock: { ...refund.restock, [item.lineItemId]: n } });
                      return item.quantity === 1 ? (
                        <Checkbox key={item.lineItemId} checked={count === 1} onChange={(e) => setCount(e.target.checked ? 1 : 0)}>
                          {item.name}
                        </Checkbox>
                      ) : (
                        <Box key={item.lineItemId} gap="SP2" verticalAlign="middle">
                          <Box width="72px">
                            <Input
                              type="number"
                              min={0}
                              max={item.quantity}
                              value={String(count)}
                              onChange={(e) => setCount(Math.min(item.quantity, Math.max(0, Math.floor(Number(e.target.value) || 0))))}
                            />
                          </Box>
                          <Text>{`of ${item.quantity} × ${item.name}`}</Text>
                        </Box>
                      );
                    })}
                    <Text size="small" secondary>
                      Leave damaged items out so they aren't sold again.
                    </Text>
                  </Box>
                ) : (
                  <Text size="small" secondary>
                    Store credit doesn't change your stock. If the items can be sold again, adjust the inventory in Wix
                    Stores.
                  </Text>
                )}

                <Checkbox checked={refund.notify} onChange={(e) => setRefund({ ...refund, notify: e.target.checked })}>
                  {refund.payout === 'credit' ? 'Email the customer the code' : 'Email the customer a refund confirmation'}
                </Checkbox>
              </Box>
            }
          />
        )}
      </Modal>
    </WixDesignSystemProvider>
  );
};

export default ReturnsPage;
