import { useState, useEffect, useMemo } from 'react';
import { SyncedObjectManager, SyncedObjectError } from './SyncedObjectManager';

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
        const safeMode = options.safeMode === false ? false : true;
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
    const { dependencies = ["modify", "pull", "push", "error"], properties = [], safeMode = true }
     = useMemo(() => handleProps(key, options), [key]);
    useEffect(() => {
        // Initialize synced object:
        const syncedObject = SyncedObjectManager.getSyncedObject(key);
        if (!syncedObject) {
            return;
        }
        setSyncedObject(syncedObject);
        setSyncedData(syncedObject.data);
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
            // Property check:
            if (properties.length > 0 && event.detail.changelog.length > 0) {
                const containsCommonElement = event.detail.changelog.some(element => properties.includes(element));
                if (!containsCommonElement) {
                    return;
                }
            }
            // Dependency checks:
            if (event.detail.requestType === "modify") {
                setSyncedSuccess(event.detail.success);
                if (dependencies.includes("modify")) {
                    // console.log("rerendering due to modify");
                    setRerender(rerender => rerender + 1);
                    return;
                }
                if (dependencies.includes("modify_external") && event.detail.callerId !== componentId) {
                    // console.log("rerendering due to modify_external");
                    setRerender(rerender => rerender + 1);
                    return;
                }
                return;
            }
            if (event.detail.requestType === "push" && dependencies.includes("push") ||
                event.detail.requestType === "pull" && dependencies.includes("pull")) {
                // console.log("rerendering due to " + event.detail.requestType);
                setSyncedSuccess(event.detail.success);
                setSyncedError(event.detail.error);
                setRerender(rerender => rerender + 1);
                return;
            }
            if (syncedError !== event.detail.error && dependencies.includes("error")) {
                // console.log("syncedError: " + syncedError);
                // console.log("rerendering due to error: ");
                // console.log(event.detail.error);
                setSyncedError(event.detail.error);
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
     const modify = (property, debounceTime) => {
        setSyncedSuccess(null);
        syncedObject.callerId = componentId;
        return syncedObject.modify(property, debounceTime);
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