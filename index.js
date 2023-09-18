// index.js
import { SyncedObjectManager } from './src/SyncedObjectManager';
import useSyncedObject from './src/useSyncedObject';

const initializeSyncedObject = SyncedObjectManager.initializeSyncedObject;
const getSyncedObject = SyncedObjectManager.getSyncedObject;
const deleteSyncedObject = SyncedObjectManager.deleteSyncedObject;
const findInLocalStorage = SyncedObjectManager.findInLocalStorage;
const removeFromLocalStorage = SyncedObjectManager.removeFromLocalStorage;

export { useSyncedObject, initializeSyncedObject, getSyncedObject, deleteSyncedObject, findInLocalStorage, removeFromLocalStorage };
