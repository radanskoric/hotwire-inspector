import { PANEL_APP_PROPERTY, PanelNodeController } from './panel-node-controller.js';

export function registerPanelControllers(application, panelApp, document = globalThis.document) {
  document[PANEL_APP_PROPERTY] = panelApp;
  application.register('panel-node', PanelNodeController);
}
