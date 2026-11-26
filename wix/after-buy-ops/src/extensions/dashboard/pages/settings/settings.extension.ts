import { extensions } from '@wix/custom-extensions'

export default extensions.dashboardPage({
  id: '4bb0be89-9216-4d07-a7fc-591c509ef696',
  title: "Settings",
  routePath: 'settings',
  component: './extensions/dashboard/pages/settings/settings.tsx',
  fullPage: false,
  metaData: {
    searchable: true,
    description: "Manage Settings in your dashboard.",
  },
});
