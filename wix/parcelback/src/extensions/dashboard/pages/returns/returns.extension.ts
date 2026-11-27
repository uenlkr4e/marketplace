import { extensions } from '@wix/custom-extensions'

export default extensions.dashboardPage({
  id: 'fa634d5e-9cf5-4d3a-9622-bfbefafb42fc',
  title: "Returns",
  routePath: 'returns',
  component: './extensions/dashboard/pages/returns/returns.tsx',
  fullPage: false,
  metaData: {
    searchable: true,
    description: "Manage Returns in your dashboard.",
  },
});
