import { extensions } from '@wix/custom-extensions';
import { APP_SIDEBAR_CATEGORY_ID } from '../../sidebar-categories/parcelback/parcelback.extension.ts';

export default extensions.dashboardPage({
  id: '4bb0be89-9216-4d07-a7fc-591c509ef696',
  title: "Settings",
  routePath: 'settings',
  component: './extensions/dashboard/pages/settings/settings.tsx',
  fullPage: false,
  pageCategoryId: APP_SIDEBAR_CATEGORY_ID,
  priority: 1,
  metaData: {
    searchable: true,
    description: "Manage Settings in your dashboard.",
  },
});
