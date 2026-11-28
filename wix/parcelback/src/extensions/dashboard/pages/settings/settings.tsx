import { type FC, useEffect, useMemo, useState } from 'react';
import {
  Box,
  Button,
  Card,
  Checkbox,
  FormField,
  Input,
  InputArea,
  Loader,
  Page,
  SectionHelper,
  Text,
  ToggleSwitch,
  WixDesignSystemProvider,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { dashboard } from '@wix/dashboard';
import { RETURN_REASONS } from '../../../../shared/returns';
import {
  LIMITS,
  isBuiltInReason,
  validateSettings,
  type FinalSaleProduct,
  type StoreSettings,
} from '../../../../shared/settings';
import { call } from '../../api';

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));

// The form keeps the window as text so a half-typed number doesn't jump around.
type Draft = Omit<StoreSettings, 'returnWindowDays'> & { returnWindowDays: string };

const toDraft = (s: StoreSettings): Draft => ({ ...s, returnWindowDays: String(s.returnWindowDays) });
const fromDraft = (d: Draft) => ({ ...d, returnWindowDays: Number(d.returnWindowDays) });

const SettingsPage: FC = () => {
  const [saved, setSaved] = useState<Draft | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [newReason, setNewReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [productQuery, setProductQuery] = useState('');
  const [productResults, setProductResults] = useState<FinalSaleProduct[] | null>(null);
  const [productError, setProductError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    call<{ settings: StoreSettings; appVersion: string | null }>('merchant/settings')
      .then(({ settings, appVersion }) => {
        setSaved(toDraft(settings));
        setDraft(toDraft(settings));
        setAppVersion(appVersion);
      })
      .catch((e) => dashboard.showToast({ message: `Couldn't load settings: ${errorMessage(e)}`, type: 'error' }));
  }, []);

  // Product search for the final-sale list, debounced while typing.
  useEffect(() => {
    const text = productQuery.trim();
    if (!text) {
      setProductResults(null);
      return;
    }
    const timer = setTimeout(() => {
      call<{ products: FinalSaleProduct[] }>(`merchant/products?q=${encodeURIComponent(text)}`)
        .then(({ products }) => {
          setProductResults(products);
          setProductError(null);
        })
        .catch((e) => setProductError(errorMessage(e)));
    }, 300);
    return () => clearTimeout(timer);
  }, [productQuery]);

  const validation = useMemo(() => (draft ? validateSettings(fromDraft(draft)) : null), [draft]);
  const invalid = validation && 'error' in validation ? validation : null;
  const error = invalid?.error ?? null;
  const windowError = invalid?.field === 'returnWindowDays' ? invalid.error : undefined;
  const changed = JSON.stringify(draft) !== JSON.stringify(saved);

  if (!draft) {
    return (
      <WixDesignSystemProvider>
        <Page>
          <Page.Content>
            <Box align="center" padding="SP10">
              <Loader />
            </Box>
          </Page.Content>
        </Page>
      </WixDesignSystemProvider>
    );
  }

  const update = (patch: Partial<Draft>) => setDraft({ ...draft, ...patch });
  const custom = draft.returnReasons.filter((r) => !isBuiltInReason(r));

  // Built-in reasons keep their default order, followed by custom ones.
  const toggleBuiltIn = (reason: string, on: boolean) => {
    const builtIn = RETURN_REASONS.filter((r) => (r === reason ? on : draft.returnReasons.includes(r)));
    update({ returnReasons: [...builtIn, ...custom] });
  };

  const trimmedNew = newReason.trim().replace(/\s+/g, ' ');
  const newReasonError = !trimmedNew
    ? null
    : draft.returnReasons.some((r) => r.toLowerCase() === trimmedNew.toLowerCase())
      ? 'That reason is already in the list.'
      : trimmedNew.length > LIMITS.maxReasonLength
        ? `Keep it under ${LIMITS.maxReasonLength} characters.`
        : null;
  const canAdd = Boolean(trimmedNew) && !newReasonError && custom.length < LIMITS.maxCustomReasons;
  const addReason = () => {
    if (!canAdd) return;
    update({ returnReasons: [...draft.returnReasons, trimmedNew] });
    setNewReason('');
  };

  const save = async () => {
    if (!validation || 'error' in validation) return;
    setSaving(true);
    try {
      const { settings } = await call<{ settings: StoreSettings }>('merchant/settings', {
        method: 'POST',
        body: validation.settings,
      });
      setSaved(toDraft(settings));
      setDraft(toDraft(settings));
      dashboard.showToast({ message: 'Settings saved.', type: 'success' });
    } catch (e) {
      dashboard.showToast({ message: `Couldn't save: ${errorMessage(e)}`, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="Settings"
          subtitle="Your return policy for the order lookup widget."
          actionsBar={
            <Box gap="SP2">
              <Button priority="secondary" disabled={!changed || saving} onClick={() => setDraft(saved)}>
                Cancel
              </Button>
              <Button disabled={!changed || Boolean(error) || saving} onClick={save}>
                {saving ? 'Saving…' : 'Save'}
              </Button>
            </Box>
          }
        />
        <Page.Content>
          <Box direction="vertical" gap="SP6">
            <Card>
              <Card.Header title="Returns" subtitle="Changes apply to new return requests; existing ones aren't affected." />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP5">
                  <Box gap="SP3" verticalAlign="middle">
                    <ToggleSwitch
                      checked={draft.acceptReturns}
                      onChange={(e) => update({ acceptReturns: e.target.checked })}
                    />
                    <Box direction="vertical">
                      <Text weight="normal">Accept return requests</Text>
                      <Text size="small" secondary>
                        When off, customers can still track orders (and use the EU withdrawal button if it's on), but
                        the "Start a return" button is hidden.
                      </Text>
                    </Box>
                  </Box>
                  <FormField
                    label="Return window"
                    infoContent="Counted from the first shipment, or from the order date if nothing has shipped yet."
                    status={windowError ? 'error' : undefined}
                    statusMessage={windowError}
                  >
                    <Box width="160px">
                      <Input
                        type="number"
                        min={LIMITS.minWindowDays}
                        max={LIMITS.maxWindowDays}
                        value={draft.returnWindowDays}
                        disabled={!draft.acceptReturns}
                        onChange={(e) => update({ returnWindowDays: e.target.value })}
                        suffix={<Input.Affix>days</Input.Affix>}
                      />
                    </Box>
                  </FormField>
                  <FormField
                    label="Return instructions"
                    infoContent="Shown to the customer on their order page once you approve a return."
                    charCount={LIMITS.maxInstructionsLength - draft.returnInstructions.length}
                  >
                    <InputArea
                      rows={4}
                      maxLength={LIMITS.maxInstructionsLength}
                      placeholder={'For example: Send the items to Example Store, 12 High Street, 10115 Berlin. Write your return number on the parcel.'}
                      value={draft.returnInstructions}
                      disabled={!draft.acceptReturns}
                      onChange={(e) => update({ returnInstructions: e.target.value })}
                    />
                  </FormField>
                </Box>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header
                title="Return reasons"
                subtitle="Customers pick one when they start a return. Built-in reasons are shown in the customer's language; custom reasons appear exactly as you type them."
              />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP4">
                  <Box direction="vertical" gap="SP2">
                    {RETURN_REASONS.map((reason) => (
                      <Checkbox
                        key={reason}
                        checked={draft.returnReasons.includes(reason)}
                        disabled={!draft.acceptReturns}
                        onChange={(e) => toggleBuiltIn(reason, e.target.checked)}
                      >
                        {reason}
                      </Checkbox>
                    ))}
                  </Box>
                  {custom.length > 0 && (
                    <Box direction="vertical" gap="SP2">
                      <Text weight="bold" size="small">
                        Custom reasons
                      </Text>
                      {custom.map((reason) => (
                        <Box key={reason} gap="SP2" verticalAlign="middle">
                          <Text>{reason}</Text>
                          <Button
                            size="tiny"
                            priority="secondary"
                            skin="destructive"
                            disabled={!draft.acceptReturns}
                            onClick={() => update({ returnReasons: draft.returnReasons.filter((r) => r !== reason) })}
                          >
                            Remove
                          </Button>
                        </Box>
                      ))}
                    </Box>
                  )}
                  <FormField
                    label="Add a custom reason"
                    status={newReasonError ? 'error' : undefined}
                    statusMessage={newReasonError ?? undefined}
                    infoContent={`Up to ${LIMITS.maxCustomReasons} custom reasons.`}
                  >
                    <Box gap="SP2">
                      <div style={{ width: 320 }}>
                        <Input
                          value={newReason}
                          placeholder="e.g. Arrived too late"
                          maxLength={LIMITS.maxReasonLength + 10}
                          disabled={!draft.acceptReturns || custom.length >= LIMITS.maxCustomReasons}
                          onChange={(e) => setNewReason(e.target.value)}
                          onEnterPressed={addReason}
                        />
                      </div>
                      <Button priority="secondary" disabled={!canAdd || !draft.acceptReturns} onClick={addReason}>
                        Add
                      </Button>
                    </Box>
                  </FormField>
                  {invalid?.field === 'returnReasons' && <SectionHelper skin="danger">{error}</SectionHelper>}
                </Box>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header
                title="Final sale products"
                subtitle="These products can't be returned; the widget marks them as final sale. EU customers can still withdraw from the contract for them, unless a legal exemption applies."
              />
              <Card.Divider />
              <Card.Content>
                <Box direction="vertical" gap="SP4">
                  {draft.finalSaleProducts.length ? (
                    <Box direction="vertical" gap="SP2">
                      {draft.finalSaleProducts.map((product) => (
                        <Box key={product.id} gap="SP2" verticalAlign="middle">
                          <Text>{product.name || product.id}</Text>
                          <Button
                            size="tiny"
                            priority="secondary"
                            skin="destructive"
                            onClick={() =>
                              update({ finalSaleProducts: draft.finalSaleProducts.filter((p) => p.id !== product.id) })
                            }
                          >
                            Remove
                          </Button>
                        </Box>
                      ))}
                    </Box>
                  ) : (
                    <Text size="small" secondary>
                      No final sale products. All products can be returned.
                    </Text>
                  )}
                  <FormField
                    label="Add a product"
                    status={productError ? 'error' : undefined}
                    statusMessage={productError ? `Couldn't search products: ${productError}` : undefined}
                  >
                    <div style={{ width: 320 }}>
                      <Input
                        value={productQuery}
                        placeholder="Search products by name"
                        disabled={draft.finalSaleProducts.length >= LIMITS.maxFinalSaleProducts}
                        onChange={(e) => setProductQuery(e.target.value)}
                        clearButton
                        onClear={() => setProductQuery('')}
                      />
                    </div>
                  </FormField>
                  {productResults && (
                    <Box direction="vertical" gap="SP1">
                      {productResults.length === 0 && (
                        <Text size="small" secondary>
                          No products found.
                        </Text>
                      )}
                      {productResults.map((product) => {
                        const added = draft.finalSaleProducts.some((p) => p.id === product.id);
                        return (
                          <Box key={product.id} gap="SP2" verticalAlign="middle">
                            <Text size="small">{product.name}</Text>
                            <Button
                              size="tiny"
                              priority="secondary"
                              disabled={added}
                              onClick={() => update({ finalSaleProducts: [...draft.finalSaleProducts, product] })}
                            >
                              {added ? 'Added' : 'Add'}
                            </Button>
                          </Box>
                        );
                      })}
                    </Box>
                  )}
                </Box>
              </Card.Content>
            </Card>

            <Card>
              <Card.Header title="EU withdrawal button" />
              <Card.Divider />
              <Card.Content>
                <Text size="small">
                  The withdrawal period is set by law, so it isn't configurable here: 14 days after delivery. Parcelback
                  counts 14 days plus a 7-day delivery buffer from the last shipment, because Wix doesn't record
                  delivery dates. Turn the button on in the Editor: select the order lookup widget, open Settings and
                  switch on "EU withdrawal button".
                </Text>
              </Card.Content>
            </Card>

            {appVersion && (
              <Text size="tiny" secondary>
                Parcelback {appVersion}
              </Text>
            )}
          </Box>
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default SettingsPage;
