import { useState, useEffect, useMemo } from 'react';
import { SyncedObjectManager, SyncedObjectError, SyncedObject } from './SyncedObjectManager';

/**
 * @typedef {Object} returnBundle
 * @property {SyncedObject|null} syncedObject - The {@link SyncedObject} if it exists.
 * @property {Object|null} syncedData - The synced object's data.
 * @property {boolean|null} syncedSuccess - The success state of the last sync attempt: either true, false, or null if syncing.
 * @property {Error|null} syncedError - The error object generated from the last sync attempt, if any.
 * @property {function(string|number|undefined, number|undefined): syncedData} modify - A function for modifying the synced object, with the same arguments as {@link SyncedObject.modify}.
 */

/**
 * A custom hook for interacting with an existing synced object through a component.
 * @param {string} key
 * @param {Object} [options]
 * @param {string|string[]} [options.dependencies=["modify", "pull", "push", "error"]]
 * @param {string|string[]} [options.properties=[""]]
 * @param {boolean} [options.safeMode=true | false]
 * @returns {returnBundle} Several methods and properties for interacting with the synced object.
 * - `syncedObject`: The {@link SyncedObject} if it exists.
 * - `syncedData`: The synced object's data.
 * - `syncedSuccess`: The success state of the last sync attempt: either true, false, or null if syncing.
 * - `syncedError`: The error object generated from the last sync attempt, if any.
 * - `modify`: A function for modifying the synced object, with the same arguments as {@link SyncedObject.modify}.
 * @example
 * const { syncedObject, syncedData, syncedSuccess, syncedError, modify } = useSyncedObject("myObject");
 * 
 */
const useSyncedObject = (key, options) => {
    // Checks:
    if (typeof useState !== 'function' || typeof useEffect !== 'function' || typeof useMemo !== 'function') {
        throw new SyncedObjectError('This version of React does not support the required hooks: [useState, useEffect, useMemo]', key, 'useSyncedObject');
    }
    // Setup:
    const [rerender, setRerender] = useState(0);
    const [componentId, setComponentId] = useState(-1);
    const handleProps = (key, options) => {
        const result = {};
        // Validate props:
        if (!key) {
            throw new SyncedObjectError("useSyncedObject hook error: key is required", key, "useSyncedObject");
        }
        if (!options) {
            return result;
        }
        const safeMode = options.safeMode === undefined ? SyncedObjectManager.globalSafeMode : options.safeMode;
        result.safeMode = safeMode;
        if (options.dependencies) {
            if (safeMode) {
                if (typeof options.dependencies === "string") {
                    options.dependencies = [options.dependencies];
                }
                if (Array.isArray(options.dependencies)) {
                    result.dependencies = [];
                }
                else {
                    throw new SyncedObjectError("useSyncedObject hook error: options.dependencies must be an string or array of strings", key, "useSyncedObject");
                }
                // Loop through array, check each string:
                options.dependencies.forEach((dependency) => {
                    if (dependency === "modify" || dependency === "modify_external" || dependency === "push" || dependency === "pull" || dependency === "error") {
                        result.dependencies.push(dependency);
                    }
                    else {
                        throw new SyncedObjectError("useSyncedObject hook error: options.dependencies strings must be one of: 'modify', 'modify_external', 'push', 'pull', 'error'", key, "useSyncedObject");
                    }
                });
            }
            else {
                if (typeof options.dependencies === "string") {
                    result.dependencies = [options.dependencies];
                }
                else {
                    result.dependencies = options.dependencies;
                }
            }
        }
        if (options.properties) {
            if (safeMode) {
                if (typeof options.properties === "string") {
                    options.properties = [options.properties];
                }
                if (Array.isArray(options.properties)) {
                    result.properties = [];
                }
                else {
                    throw new SyncedObjectError("useSyncedObject hook error: options.properties must be an string or array of strings", key, "useSyncedObject");
                }
                // Loop through array, check each string:
                options.properties.forEach((properties) => {
                    if (typeof properties === "string") {
                        result.properties.push(properties);
                    }
                    else {
                        throw new SyncedObjectError("useSyncedObject hook error: options.properties must be an string or array of strings", key, "useSyncedObject");
                    }
                });
            }
            else {
                if (typeof options.properties === "string") {
                    result.properties = [options.properties];
                }
                else {
                    result.properties = options.properties;
                }
            }
        }
        return result;
    };
    const { dependencies = ["modify", "pull", "push", "error"], properties = [""], safeMode }
     = useMemo(() => handleProps(key, options), [key]);
    useEffect(() => {
        // Initialize synced object:
        const syncedObject = SyncedObjectManager.getSyncedObject(key);
        if (!syncedObject) {
            setSyncedObject(null);
            setSyncedData(null);
            setSyncedSuccess(null);
            setSyncedError(null);
        }
        else {
            setSyncedObject(syncedObject);
            setSyncedData(syncedObject.data);
            setSyncedSuccess(syncedObject.state.success);
            setSyncedError(syncedObject.state.error);
        }
    }, [rerender]);
    useEffect(() => {
        // Checks:
        if (safeMode && !SyncedObjectManager.getSyncedObject(key)) {
            console.warn("useSyncedObject hook warning: key '" + key + "' does not exist in SyncedObjectManager. Initialize before usage, if possible. ");
        }
        // Add event listener, setup componentId: 
        let componentId = SyncedObjectManager.generateComponentId();
        setComponentId(componentId);
        const eventHandler = (event) => {
            // Key check:
            if (event.detail.key !== key) {
                return;
            }
            // Delete check:
            if (event.detail.requestType === "delete") {
                setRerender(rerender => rerender + 1);
                return;
            }
            // Dependency checks:
            if (event.detail.requestType === "modify" && 
            (dependencies.includes("modify") || 
            (dependencies.includes("modify_external") && event.detail.callerId !== componentId))) {
                // Property checks:
                const changelogEmpty = event.detail.changelog.length === 0;
                const propertiesEmpty = properties.length === 0;
                const propertiesContainsEmptyString = properties.includes("");
                if (changelogEmpty) {
                    // modify() will rerender properties = [] || [""] || ["", "myProp"], but not properties = ["myProp"].
                    if (propertiesEmpty || propertiesContainsEmptyString) {
                        setRerender(rerender => rerender + 1);
                    }
                    return;
                }
                else {
                    // modify("myProp") will rerender properties = [""] || [..., "myProp"], but not ["", "myProp2"].
                    const changelogContainsProperty = event.detail.changelog.some(element => properties.includes(element));
                    if (changelogContainsProperty || (propertiesContainsEmptyString && properties.length === 1)) {
                        setRerender(rerender => rerender + 1);
                    }
                    return;
                }
            }
            if (event.detail.requestType === "push" && dependencies.includes("push") ||
                event.detail.requestType === "pull" && dependencies.includes("pull")) {
                setRerender(rerender => rerender + 1);
                return;
            }
            if (syncedError !== event.detail.error && dependencies.includes("error")) {
                setRerender(rerender => rerender + 1);
                return;
            }
        }
        document.addEventListener('syncedObjectEvent', eventHandler);
        // Cleanup:
        return () => {
            document.removeEventListener('syncedObjectEvent', eventHandler);
        };
    }, [key]);

    // Interface:
    const [syncedObject, setSyncedObject] = useState(null);
    const [syncedData, setSyncedData] = useState(null);
    const [syncedSuccess, setSyncedSuccess] = useState(null);
    const [syncedError, setSyncedError] = useState(null);
    const modify = (arg1, arg2) => {
        if (!syncedObject) return;
        syncedObject.callerId = componentId;
        SyncedObjectManager.handleModifications(syncedObject, arg1, arg2);
        return syncedObject.data;
    };

    // Exports:
    return {
        syncedObject,
        syncedData,
        syncedSuccess,
        syncedError,
        modify,
    };
};

export default useSyncedObject;
