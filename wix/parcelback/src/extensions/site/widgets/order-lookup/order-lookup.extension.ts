import { extensions } from '@wix/custom-extensions'

export default extensions.customElement({
  id: '7471e5f1-356f-44e1-a9c7-e1bf6351364b',
  name: "order-lookup",
  width: {
    defaultWidth: 450,
    allowStretch: true
  },
  height: {
    defaultHeight: 250
  },
  installation: {
    autoAdd: true
  },
  presets: [
    {
      id: 'c79bdca8-83f2-4021-94c3-4763815cc92c',
      name: 'default',
      thumbnailUrl: '{{BASE_URL}}/order-lookup-thumbnail.png',
    },
  ],
  tagName: 'order-lookup',
  element: './extensions/site/widgets/order-lookup/order-lookup.tsx',
  settings: './extensions/site/widgets/order-lookup/order-lookup.panel.tsx',
});
