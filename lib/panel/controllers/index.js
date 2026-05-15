import { PANEL_BRIDGE_PROPERTY } from '../../constants.js';
import { PanelNodeController } from './panel-node-controller.js';
import { ThemeController } from './theme-controller.js';

export function registerPanelControllers(application, panelBridge, document = globalThis.document) {
  document[PANEL_BRIDGE_PROPERTY] = panelBridge;
  application.register('panel-node', PanelNodeController);
  application.register('theme', ThemeController);
}
