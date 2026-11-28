import { extensions } from '@wix/custom-extensions';

// Groups the app's dashboard pages under "Parcelback" in the sidebar. Without
// it, "Returns" and "Settings" sit loose under Apps, next to other apps' pages.
export const APP_SIDEBAR_CATEGORY_ID = '92e73235-455c-4b1c-94c3-d1e6499550aa';

export default extensions.dashboardSidebarCategory({
  id: APP_SIDEBAR_CATEGORY_ID,
  title: 'Parcelback',
});
