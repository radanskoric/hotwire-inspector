import { Application } from '@hotwired/stimulus';
import { PanelApp } from '../../lib/panel-app.js';
import { PanelBridge } from '../../lib/panel-bridge.js';
import { registerPanelControllers } from '../../lib/panel/controllers/index.js';

const bridge = new PanelBridge();
const panelApp = new PanelApp({ bridge });
const stimulusApplication = Application.start();

registerPanelControllers(stimulusApplication, bridge);
panelApp.start();
