// @ts-check
import { defineWixConfig } from '@wix/cli/config';
import customExtensions from '@wix/custom-extensions/flow';
import zeroConfig from '@wix/cli-zero-config-flow';

const appId = '86ebe6bd-c355-479b-8ad9-80de52f3cd9e';

export default defineWixConfig({
  flows: [
    customExtensions({
      appId,
      projectId: 'after-buy-ops',
      namespace: '@uenlkr4e/after-buy-ops',
      codeIdentifier: 'after_buy_ops',
    }),
    zeroConfig({ appId }),
  ],
});
