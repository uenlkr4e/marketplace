import React, { type FC, useState, useEffect, useCallback } from 'react';
import { widget } from '@wix/editor';
import {
  Dropdown,
  SidePanel,
  WixDesignSystemProvider,
  Input,
  FormField,
  SectionHelper,
  ToggleSwitch,
} from '@wix/design-system';
import '@wix/design-system/styles.global.css';
import { LANGUAGES } from './i18n';

const LANGUAGE_OPTIONS = [
  { id: 'auto', value: 'Site language (automatic)' },
  ...LANGUAGES.map((l) => ({ id: l.id, value: l.name })),
];

const SITE_WIDGETS_DOCS = 'https://dev.wix.com/docs/wix-cli/guides/extensions/site-extensions/site-widgets/site-widget-extension-files-and-code';

const Panel: FC = () => {
  const [displayName, setDisplayName] = useState<string>('');
  const [withdrawalButton, setWithdrawalButton] = useState(false);
  const [language, setLanguage] = useState('auto');

  useEffect(() => {
    widget.getProp('display-name')
      .then(displayName => setDisplayName(displayName || ''))
      .catch(error => console.error('Failed to fetch display-name:', error));
    widget.getProp('withdrawal-button')
      .then(value => setWithdrawalButton(value === 'true'))
      .catch(error => console.error('Failed to fetch withdrawal-button:', error));
    widget.getProp('language')
      .then(value => setLanguage(value || 'auto'))
      .catch(error => console.error('Failed to fetch language:', error));
  }, [setDisplayName]);

  const handleLanguageSelect = useCallback((option: { id: string | number }) => {
    setLanguage(String(option.id));
    widget.setProp('language', String(option.id));
  }, []);

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
            <FormField label="Heading" infoContent="Leave empty to show “Track your order” in the widget’s language.">
              <Input
                type="text"
                value={displayName}
                placeholder="Track your order"
                onChange={handleDisplayNameChange}
                aria-label="Heading"
              />
            </FormField>
          </SidePanel.Field>
          <SidePanel.Field>
            <FormField
              label="Language"
              infoContent="Language of the widget text. Automatic uses the site's language: English, German, French, Spanish, Italian, Dutch or Portuguese (other languages fall back to English). Your custom heading isn't translated."
            >
              <Dropdown options={LANGUAGE_OPTIONS} selectedId={language} onSelect={handleLanguageSelect} />
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
