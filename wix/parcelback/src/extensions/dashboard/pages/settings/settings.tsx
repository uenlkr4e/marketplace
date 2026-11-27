import type { FC } from 'react';
import { EmptyState, Page, WixDesignSystemProvider } from '@wix/design-system';
import '@wix/design-system/styles.global.css';

const DashboardPage: FC = () => {
  return (
    <WixDesignSystemProvider>
      <Page>
        <Page.Header
          title="Settings"
          subtitle="Return window, eligible products and the EU withdrawal form."
        />
        <Page.Content>
          <EmptyState
            title="Settings"
            subtitle="Coming soon."
            skin="page"
          />
        </Page.Content>
      </Page>
    </WixDesignSystemProvider>
  );
};

export default DashboardPage;
