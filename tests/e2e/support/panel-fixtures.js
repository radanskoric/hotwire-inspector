import { ID_PREFIX } from '../../../lib/constants.js';

export const fixtureScanResponse = {
  items: [
    { id: 'main-frame', src: '/main', parentId: null, type: 'frame', controllers: ['sidebar'] },
    { id: 'nested-frame', src: null, parentId: 'main-frame', type: 'frame', controllers: [] },
    { id: 'modal-controller', parentId: 'nested-frame', type: 'controller', controllers: ['modal', 'dropdown'] },
    { id: 'sidebar-controller', parentId: null, type: 'controller', controllers: ['sidebar'] },
  ],
};

export const deepScanResponse = {
  items: [
    { id: 'level-1', src: null, parentId: null, type: 'frame', controllers: [] },
    { id: 'level-2', src: null, parentId: 'level-1', type: 'frame', controllers: [] },
    { id: 'level-3', parentId: 'level-2', type: 'controller', controllers: ['modal'] },
    { id: 'level-4', src: null, parentId: 'level-3', type: 'frame', controllers: [] },
    { id: 'level-5', parentId: 'level-4', type: 'controller', controllers: ['dropdown'] },
    { id: 'level-6', src: null, parentId: 'level-5', type: 'frame', controllers: [] },
    { id: 'level-7', parentId: 'level-6', type: 'controller', controllers: ['sidebar'] },
  ],
};

export const internalIdScanResponse = {
  items: [
    { id: `${ID_PREFIX}-uuid-1`, parentId: null, type: 'controller', controllers: ['modal'] },
    { id: 'user-controller', parentId: null, type: 'controller', controllers: ['menu'] },
  ],
};

export const emptyScanResponse = { items: [] };
