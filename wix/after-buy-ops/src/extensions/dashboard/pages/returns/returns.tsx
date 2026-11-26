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
  Loader,
  Modal,
  Page,
  SectionHelper,
  Table,
  Text,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { dashboard } from '@wix/dashboard';
import type { RefundPlan, ReturnRequest, ReturnStatus } from '../../../../shared/returns';
import { applyAction, listReturnRequests, planRefund, refundRequest } from './return-actions';

const STATUS_SKIN: Record<ReturnStatus, 'warning' | 'general' | 'danger' | 'success' | 'neutral'> = {
  REQUESTED: 'warning',
  APPROVED: 'general',
  RECEIVED: 'general',
  REFUNDING: 'neutral',
  REJECTED: 'danger',
  REFUNDED: 'success',
};
const OPEN: ReturnStatus[] = ['REQUESTED', 'APPROVED', 'RECEIVED', 'REFUNDING'];

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const money = (amount: number, currency: string) => {
  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
};

type RefundDraft = { request: ReturnRequest; plan: RefundPlan; amount: string; restock: boolean; notify: boolean };

const ReturnsPage: FC = () => {
  const [requests, setRequests] = useState<ReturnRequest[] | null>(null);
  const [filter, setFilter] = useState<'open' | 'all'>('open');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refund, setRefund] = useState<RefundDraft | null>(null);

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
      setRefund({ request, plan, amount: request.requestedAmount.toFixed(2), restock: true, notify: true });
    } catch (e) {
      dashboard.showToast({ message: `Couldn't check the payment: ${errorMessage(e)}`, type: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  const confirmRefund = async () => {
    if (!refund || refund.plan.kind === 'none') return;
    const { request, plan, restock, notify } = refund;
    const amount = Number(refund.amount);
    setRefund(null);
    await run(
      request,
      () => refundRequest(request, { amount, restock, notifyCustomer: notify }),
      plan.kind === 'manual' ? `${request.rmaNumber} recorded as refunded.` : `${request.rmaNumber} refunded.`,
    );
  };

  const visible = useMemo(
    () => (requests ?? []).filter((r) => filter === 'all' || OPEN.includes(r.status)),
    [requests, filter],
  );

  const actions = (r: ReturnRequest) => {
    if (busyId === r.id) return <Loader size="tiny" />;
    return (
      <Box gap="SP2" align="right">
        {r.status === 'REQUESTED' && (
          <>
            <Button size="small" onClick={() => run(r, () => applyAction(r, 'approve'), `${r.rmaNumber} approved.`)}>
              Approve
            </Button>
            <Button
              size="small"
              skin="destructive"
              priority="secondary"
              onClick={() => run(r, () => applyAction(r, 'reject'), `${r.rmaNumber} rejected.`)}
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
          subtitle="Return requests your customers submit from the order lookup widget."
          actionsBar={
            <Button priority="secondary" onClick={() => load()}>
              Refresh
            </Button>
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
                  { title: 'RMA', render: (r) => <Text weight="bold">{r.rmaNumber}</Text> },
                  { title: 'Order', render: (r) => `#${r.orderNumber}` },
                  { title: 'Customer', render: (r) => r.customerEmail },
                  {
                    title: 'Items',
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
                      </Box>
                    ),
                  },
                  {
                    title: 'Amount',
                    render: (r) =>
                      r.status === 'REFUNDED' && r.refundedAmount != null
                        ? `${money(r.refundedAmount, r.currency)} refunded`
                        : money(r.requestedAmount, r.currency),
                  },
                  {
                    title: 'Status',
                    render: (r) => (
                      <Badge size="small" skin={STATUS_SKIN[r.status]}>
                        {r.status}
                      </Badge>
                    ),
                  },
                  {
                    title: 'Requested',
                    render: (r) => (new Date(r.createdAt).toLocaleDateString()),
                  },
                  { title: '', render: actions, width: '240px' },
                ]}
              >
                <Table.Content />
              </Table>
            )}
          </Card>
        </Page.Content>
      </Page>

      <Modal isOpen={refund !== null} onRequestClose={() => setRefund(null)} shouldCloseOnOverlayClick>
        {refund && (
          <CustomModalLayout
            title={`Refund ${refund.request.rmaNumber}`}
            primaryButtonText={refund.plan.kind === 'manual' ? 'Record refund' : 'Refund'}
            primaryButtonProps={{ disabled: refund.plan.kind === 'none' || !amountValid }}
            primaryButtonOnClick={confirmRefund}
            secondaryButtonText="Cancel"
            secondaryButtonOnClick={() => setRefund(null)}
            onCloseButtonClick={() => setRefund(null)}
            width="520px"
            content={
              <Box direction="vertical" gap="SP4">
                {refund.plan.kind === 'automatic' && (
                  <Text>{`The money goes back to the customer's original payment (${refund.plan.method}).`}</Text>
                )}
                {refund.plan.kind === 'manual' && (
                  <SectionHelper skin="warning">
                    {`This order was paid with ${refund.plan.method || 'a manual payment method'}, which Wix can't refund automatically (${refund.plan.reason}). Send the money to the customer yourself; this only records the refund in Wix.`}
                  </SectionHelper>
                )}
                {refund.plan.kind === 'none' && (
                  <SectionHelper skin="danger">{`This order can't be refunded: ${refund.plan.reason}.`}</SectionHelper>
                )}
                <FormField
                  label={`Refund amount (${refund.request.currency})`}
                  status={amountValid ? undefined : 'error'}
                  statusMessage={amountValid ? undefined : 'Enter an amount like 12.50'}
                >
                  <Input value={refund.amount} onChange={(e) => setRefund({ ...refund, amount: e.target.value })} />
                </FormField>
                <Checkbox checked={refund.restock} onChange={(e) => setRefund({ ...refund, restock: e.target.checked })}>
                  Put the returned items back in stock
                </Checkbox>
                <Checkbox checked={refund.notify} onChange={(e) => setRefund({ ...refund, notify: e.target.checked })}>
                  Email the customer a refund confirmation
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
