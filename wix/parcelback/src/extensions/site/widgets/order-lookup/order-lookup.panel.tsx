import React, { type FC, useState, useEffect, useCallback } from 'react';
import { widget } from '@wix/editor';
import {
  SidePanel,
  WixDesignSystemProvider,
  Input,
  FormField,
  SectionHelper,
  ToggleSwitch,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';

const SITE_WIDGETS_DOCS = 'https://dev.wix.com/docs/wix-cli/guides/extensions/site-extensions/site-widgets/site-widget-extension-files-and-code';

const Panel: FC = () => {
  const [displayName, setDisplayName] = useState<string>('');
  const [withdrawalButton, setWithdrawalButton] = useState(false);

  useEffect(() => {
    widget.getProp('display-name')
      .then(displayName => setDisplayName(displayName || 'Track your order'))
      .catch(error => console.error('Failed to fetch display-name:', error));
    widget.getProp('withdrawal-button')
      .then(value => setWithdrawalButton(value === 'true'))
      .catch(error => console.error('Failed to fetch withdrawal-button:', error));
  }, [setDisplayName]);

  const handleWithdrawalButtonChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    setWithdrawalButton(event.target.checked);
    widget.setProp('withdrawal-button', String(event.target.checked));
  }, []);

  const handleDisplayNameChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
    const newDisplayName = event.target.value;
    setDisplayName(newDisplayName);
    widget.setProp('display-name', newDisplayName);
  }, [setDisplayName]);

  return (
    <WixDesignSystemProvider>
      <SidePanel width="300" height="100vh">
        <SidePanel.Content noPadding stretchVertically>
          <SidePanel.Field>
            <FormField label="Heading">
              <Input
                type="text"
                value={displayName}
                onChange={handleDisplayNameChange}
                aria-label="Heading"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField
              label="EU withdrawal button"
              labelPlacement="left"
              infoContent="Shows a “Withdraw from contract here” button, required for stores selling to consumers in the EU since June 2026. Customers get a timestamped confirmation email."
            >
              <ToggleSwitch checked={withdrawalButton} onChange={handleWithdrawalButtonChange} />
            </FormField>
          </SidePanel.Field>
        </SidePanel.Content>
        <SidePanel.Footer noPadding>
          <SectionHelper fullWidth appearance="success" border="topBottom">
            Learn more about <a href={SITE_WIDGETS_DOCS} target="_blank" rel="noopener noreferrer" title="Site Widget docs">Site Widgets</a>
          </SectionHelper>
        </SidePanel.Footer>
      </SidePanel>
    </WixDesignSystemProvider>
  );
};

export default Panel;
