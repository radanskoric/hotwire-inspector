import { browser } from 'wxt/browser';

console.log("ABOUT TO CREATE DEVTOOLS PANEL")
browser.devtools.panels.create(
  'Hotwire Inspector',
  'icon.svg',
  'panel.html',
  (panel) => {
    console.log('Hotwire Inspector panel created', panel);
  },
);
