import { extensions } from '@wix/custom-extensions';
import { APP_SIDEBAR_CATEGORY_ID } from '../../sidebar-categories/parcelback/parcelback.extension.ts';

export default extensions.dashboardPage({
  id: 'fa634d5e-9cf5-4d3a-9622-bfbefafb42fc',
  title: "Returns",
  routePath: 'returns',
  component: './extensions/dashboard/pages/returns/returns.tsx',
  fullPage: false,
  pageCategoryId: APP_SIDEBAR_CATEGORY_ID,
  priority: 0,
  metaData: {
    searchable: true,
    description: "Manage Returns in your dashboard.",
  },
});
