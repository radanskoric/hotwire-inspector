import { browser } from 'wxt/browser';

browser.devtools.panels.create(
  'Hotwire Inspector',
  'icon.svg',
  'panel.html',
  (panel) => {
    console.log('Hotwire Inspector panel created', panel);
  },
);
