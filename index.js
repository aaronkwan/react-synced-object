// index.js
import { SyncedObjectManager } from './src/SyncedObjectManager';
import useSyncedObject from './src/useSyncedObject';

const initializeSyncedObject = SyncedObjectManager.initializeSyncedObject;
const getSyncedObject = SyncedObjectManager.getSyncedObject;
const findInLocalStorage = SyncedObjectManager.findInLocalStorage;
const removeFromLocalStorage = SyncedObjectManager.removeFromLocalStorage;
const myObject = SyncedObjectManager.getSyncedObject("myObject");
myObject.modify();

export { useSyncedObject, initializeSyncedObject, getSyncedObject, findInLocalStorage, removeFromLocalStorage };
