export class SyncedObjectManager {
    // Vars:
    static localStorage = window.localStorage;
    static syncedObjects = new Map();
    static pendingSyncTasks = new Map();
    static componentCounter = 0;

    // Main Interface:
    static initializeSyncedObject(key, type, options) {
        // Initialize a new synced object using provided options.
        // Check for duplicates:
        if (this.syncedObjects.has(key)) {
            return this.syncedObjects.get(key);
        }
        // Validate input:
        if (!key || !type) {
            throw new SyncedObjectError(`Failed to initialize synced object: Missing parameters.`, key, "initializeSyncedObject");
        }
        const { defaultValue = {}, debounceTime = 0, reloadBehavior = "prevent", customSyncFunctions, callbackFunctions, safeMode = true } = options || {};
        try {
            if (safeMode) {
                this.validateInput("key", key);
                this.validateInput("type", type);
                this.validateInput("options", options);
                this.validateInput("debounceTime", debounceTime);
                this.validateInput("reloadBehavior", reloadBehavior);
                this.validateInput("customSyncFunctions", customSyncFunctions);
                this.validateInput("callbackFunctions", callbackFunctions);
            }
        }
        catch (error) {
            throw new SyncedObjectError(`Failed to initialize synced object: ${error}`, key, "initializeSyncedObject");
        }
        // Create synced object:
        const syncedObject = {
            key: key,
            type: type,
            data: defaultValue,
            changelog: [],
            debounceTime: debounceTime,
            reloadBehavior: reloadBehavior,
            safeMode: safeMode,
            callerId: null,
        }
        // Add functions:
        if (safeMode) {
            // Run checks:
            if (type === "custom") {
                if (customSyncFunctions) {
                    const { pull, push } = customSyncFunctions;
                    syncedObject.pull = pull;
                    syncedObject.push = push;
                }
                else {
                    console.warn(`Synced object initialization with key '${key}': customSyncFunctions not provided for 'custom' object. Use 'temp' or 'local' type instead.`);
                }
            }
            if (type !== "custom" && customSyncFunctions) {
                console.warn(`Synced object initialization with key '${key}': customSyncFunctions will not be run for 'temp' or 'local' objects. Use 'custom' type instead.`);
            }
            if (type === "custom" && reloadBehavior === "finish") {
                console.warn(`Synced object initialization with key '${key}': reloadBehavior 'finish' might not behave as expected for asynchronous functions.`);
            }
        }
        else {
            // Skip checks:
            if (customSyncFunctions) {
                const { pull, push } = customSyncFunctions;
                syncedObject.pull = pull;
                syncedObject.push = push;
            }
        }
        if (callbackFunctions) {
            const { onSuccess, onError } = callbackFunctions;
            syncedObject.onSuccess = onSuccess;
            syncedObject.onError = onError;
        }
        syncedObject.modify = function (arg1, arg2) {
            // Parse parameters to find property and debounceTime:
            if (typeof arg1 === "string") {
                SyncedObjectManager.handleModificationsOfProperty(this, arg1, arg2);
            }
            else {
                SyncedObjectManager.handleModifications(this, arg1);
            }
            return this.data;
        };
        // Add to storage:
        this.syncedObjects.set(key, syncedObject);
        // Initial sync:
        this.forceSyncTask(syncedObject, "pull");
        // Return:
        return syncedObject;
    }
    static getSyncedObject(key) {
        // Obtain the synced object if it exists.
        return this.syncedObjects.get(key);
    }

    // Utility Interface:
    static generateComponentId() {
        // Generate a unique component id.
        this.componentCounter++;
        return this.componentCounter;
    }

    // Local Storage Interface:
    static findMatchingInLocalStorage(keyIncludes, options) {
        // Find all objects in local storage which include the key.
        const { readOnly = true, deleteMask, initOptions } = options;
        // Validate input:
        try {
            this.validateInput("key", keyIncludes);
            this.validateInput("findMatchingOptions", options);
        }
        catch (error) {
            throw new SyncedObjectError(`Failed to find matching: ${error}`, keyIncludes, "findMatchingInLocalStorage");
        }
        const keys = Object.keys(this.localStorage);
        const matchingKeys = keys.filter((key) => key.includes(keyIncludes));
        // Create objects with data and return via array:
        if (readOnly === true) {
            return matchingKeys.map((key) => {
                const object = JSON.parse(this.localStorage.getItem(key));
                for (const property in deleteMask) {
                    delete object[property];
                }
                return object;
            });
        }
        // Initialize syncedObjects using initOptions, return keys:
        if (readOnly === false) {
            matchingKeys.map((key) => this.initializeSyncedObject(key, initOptions));
            return matchingKeys;
        }
    }
    static removeMatchingInLocalStorage() {
        // Remove all objects in local storage which include the key.
        const keys = Object.keys(this.localStorage);
        const matchingKeys = keys.filter((key) => key.includes(keyIncludes));
        matchingKeys.map((key) => this.localStorage.removeItem(key));
    }
    static resetLocalStorage() {
        // Reset all local storage, deleting the affected synced objects.
        this.localStorage.clear();
        this.syncedObjects = new Map();
        location.reload(true);
    }

    // Backend Methods:
    static async handleModificationsOfProperty(syncedObject, property, debounceTime) {
        // Modify the synced object's changelog before continuing.
        // Validate input:
        try {
            if (syncedObject.safeMode) {
                this.validateInput("modify-property", property);
                if (!syncedObject.data.hasOwnProperty(property)) {
                    console.warn(`Synced Object Modification: property '${property}' not found in synced object with key '${syncedObject.key}'.`);
                }
            }
        }
        catch (error) {
            throw new SyncedObjectError(`Failed to modify due to invalid params: ${error}`, syncedObject.key, "handleModificationsOfProperty");
        } 
        // Add property to changelog:
        if (!syncedObject.changelog.includes(property)) {
            syncedObject.changelog.push(property);
        }
        // Handle modifications:
        this.handleModifications(syncedObject, debounceTime);
    }
    static async handleModifications(syncedObject, debounceTime) {
        // Handle modifications on the synced object.
        // Validate Input:
        if (!debounceTime) {
            debounceTime = syncedObject.debounceTime;
        }
        try {
            if (syncedObject.safeMode)
            this.validateInput("modify-debounceTime", debounceTime);
        }
        catch (error) {
            throw new SyncedObjectError(`Failed to modify due to invalid params: ${error}`, syncedObject.key, "handleModifications");
        }
        // Rerender dependent components:
        setTimeout(() => {
            this.emitEvent(syncedObject, { requestType: "modify", success: null, error: null });
        }, 0);
        // Handle syncing:
        if (debounceTime === 0) {
            setTimeout(() => {
                this.forceSyncTask(syncedObject, "push");
            }, 0);
            return;
        }
        this.queueSyncTask(syncedObject, debounceTime);
    }
    static async queueSyncTask(syncedObject, debounceTime) {
        // Queue an object to be pushed, debouncing multiple requests.
        if (this.pendingSyncTasks.has(syncedObject.key)) {
            // Defer the pending sync:
            clearTimeout(this.pendingSyncTasks.get(syncedObject.key));
            this.pendingSyncTasks.delete(syncedObject.key);
        }
        // Start a timeout to sync object:
        const sync = () => {
            this.pendingSyncTasks.delete(syncedObject.key);
            this.forceSyncTask(syncedObject, "push");
        }
        const timeoutId = setTimeout(sync, debounceTime);
        this.pendingSyncTasks.set(syncedObject.key, timeoutId);
    }
    static async forceSyncTask(syncedObject, requestType) {
        // Sync an object immediately.
        try {
            if (syncedObject.type === "local") {
                if (requestType === "push") {
                    await this.pushToLocal(syncedObject);
                }
                if (requestType === "pull") {
                    await this.pullFromLocal(syncedObject);
                }
            }
            if (syncedObject.type === "custom") {
                if (requestType === "push") {
                    await this.pushToCustom(syncedObject);
                }
                if (requestType === "pull") {
                    await this.pullFromCustom(syncedObject);
                }
            }
        }
        catch (error) {
            // Handle callbacks with error:
            this.handleCallBacks(syncedObject, { requestType: requestType, success: false, error: error });
            return;
        }
        // Handle callbacks with success:
        this.handleCallBacks(syncedObject, { requestType: requestType, success: true, error: null });
    }

    // Backend Utils:
    static async pullFromLocal(syncedObject) {
        // Pull data from local storage.
        const json = this.localStorage.getItem(syncedObject.key);
        if (json) {
            syncedObject.data = JSON.parse(json);
        }
        else {
            await this.pushToLocal(syncedObject);
        }
    }
    static async pushToLocal(syncedObject) {
        // Push data to local storage.
        this.localStorage.setItem(syncedObject.key, JSON.stringify(syncedObject.data));
    }
    static async pullFromCustom(syncedObject) {
        // Call the custom pull method to obtain data.
        if (!syncedObject.pull) {
            return;
        }
        const response = await syncedObject.pull(syncedObject);
        if (response) {
            syncedObject.data = response;
        }
        else {
            await this.pushToCustom(syncedObject);
        }
    }
    static async pushToCustom(syncedObject) {
        // Call the custom push method to send data.
        if (!syncedObject.push) {
            return;
        }
        const response = await syncedObject.push(syncedObject);
    }
    static async handleCallBacks(syncedObject, status) {
        // Handle callbacks, emit events, and reset changelogs.
        const { requestType, success, error } = status;
        if (success && syncedObject.onSuccess) {
            syncedObject.onSuccess(syncedObject, status);
        }
        if (error && syncedObject.onError) {
            syncedObject.onError(syncedObject, status);
        }
        this.emitEvent(syncedObject, status);
        syncedObject.changelog = [];
        syncedObject.callerId = null;
    }
    
    // Backend Sub-Utils and Setup:
    static validateInput(type, value) {
        // Validate input for several functions.
        if (type === "key") {
            if (typeof value === "string" && value.length > 0) {
                return true;
            }
            throw "parameter 'key' must be a non-empty string."
        }
        if (type === "type") {
            if (value === "temp" || value === "local" || value === "custom") {
                return true;
            }
            throw "parameter 'type' must be either 'temp', 'local', or 'custom'."
        }
        if (type === "options") {
            if (typeof value === "object") {
                const validProperties = ["defaultValue", "debounceTime", "reloadBehavior", "customSyncFunctions", "callbackFunctions", "safeMode"];
                const properties = Object.keys(value);
                if (properties.every(prop => validProperties.includes(prop))) {
                    return true;
                }
            }
            throw "parameter 'options' must be an object without extra unsupported properties."
        }
        if (type === "debounceTime") {
            if (typeof value === "number" && value >= 0) {
                return true;
            }
            throw "parameter 'debounceTime' must be a non-negative number."
        }
        if (type === "findMatchingOptions") {
            const { readOnly = true, deleteMask, initOptions } = value;
            if (typeof readOnly === "boolean" && typeof deleteMask === "object" && typeof initOptions === "object") {
                return true;
            }
            throw "invalid options for findMatchingInLocalStorage()."
        }
        if (type === "reloadBehavior") {
            if (value === "prevent" || value === "allow" || value === "finish") {
                return true;
            }
            throw "parameter 'reloadBehavior' must be either 'prevent', 'allow', or 'finish'."
        }
        if (type === "customSyncFunctions") {
            if (!value) {
                return true;
            }
            if (typeof value === "object" && 
            (!value.pull || typeof value.pull === "function") && 
            (!value.push || typeof value.push === "function")) {
                return true;
            }
            throw "parameter 'customSyncFunctions' must be an object only containing functions 'pull' and 'push'."
        }
        if (type === "callbackFunctions") {
            if (!value) {
                return true;
            }
            if (typeof value === "object" && 
            (!value.onSuccess || typeof value.onSuccess === "function") && 
            (!value.onError || typeof value.onError === "function")) {
                return true;
            }
            throw "parameter 'callbackFunctions' must be an object only containing functions 'onSuccess' and 'onError'."
        }
        if (type === "modify-property") {
            if (typeof value === "string" && value.length > 0) {
                return true;
            }
            throw "parameter 'property' must be a non-empty string."
        }
        if (type === "modify-debounceTime") {
            if (typeof value === "number" && value >= 0) {
                return true;
            }
            throw "parameter 'debounceTime' must be a non-negative number."
        }
    }
    static emitEvent(syncedObject, status) {
        // Emit an event to components.
        const event = new CustomEvent("syncedObjectEvent", { detail: {
            key: syncedObject.key,            
            changelog: syncedObject.changelog,
            requestType: status.requestType,
            success: status.success,
            error: status.error,
            callerId: syncedObject.callerId
        } });
        document.dispatchEvent(event);
    }
    static initReloadPrevention() {
        // Prevent reloads on page close.
        window.addEventListener("beforeunload", (event) => {
            // Check for pending syncs:
            for (const [key, timeoutId] of SyncedObjectManager.pendingSyncTasks) {
                // Object is still syncing: 
                const syncedObject = SyncedObjectManager.getSyncedObject(key);
                const reloadBehavior = syncedObject.reloadBehavior;
                if (reloadBehavior === "allow") {
                    continue;
                }
                if (reloadBehavior === "finish") {
                    SyncedObjectManager.pendingSyncTasks.delete(syncedObject.key);
                    SyncedObjectManager.forceSyncTask(syncedObject, "push");
                    continue;
                }
                if (reloadBehavior === "prevent") {
                    event.preventDefault();
                    event.returnValue = "You have unsaved changes!";
                    break;
                }
            }
        });
    }
}

SyncedObjectManager.initReloadPrevention();

export class SyncedObjectError extends Error {
    constructor(message, syncedObjectKey, functionName) {
        super("SyncedObjectError: \n" + message + "  \nSynced Object Key: '" + syncedObjectKey + "'  \nFunction Name: " + functionName + "  \n");
        this.name = "SyncedObjectError";
        this.syncedObjectKey = syncedObjectKey;
        this.functionName = functionName;
    }
}



    