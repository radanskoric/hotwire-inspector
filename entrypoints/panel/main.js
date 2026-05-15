import { Application } from '@hotwired/stimulus';
import { PanelApp } from '../../lib/panel-app.js';
import { registerPanelControllers } from '../../lib/panel/controllers/index.js';

const panelApp = new PanelApp();
const stimulusApplication = Application.start();

registerPanelControllers(stimulusApplication, panelApp);
panelApp.start();
