export class SyncedObjectManager {
    // Vars:
    static localStorage = window.localStorage;
    static syncedObjects = new Map();
    static pendingSyncTasks = new Map();
    static componentCounter = 0;
    static globalSafeMode = (process.env.NODE_ENV === "production") ? false : true;

    // Main Interface:
    /**
    * Initialize a new {@link SyncedObject} using provided options.
    * @param {string} key The synced object's identifier.
    * @param {"temp"|"local"|"custom"} type The type of synced object, affecting sync behavior.
    * @param {Object} [options] - The options for initializing the synced object.
    * @param {Object} [options.defaultValue={}]
    * @param {number} [options.debounceTime=0]
    * @param {"prevent"|"allow"|"finish"} [options.reloadBehavior="prevent"]
    * @param {Object} [options.customSyncFunctions]
    * @param {Object} [options.callbackFunctions]
    * @param {boolean} [options.safeMode=true | false]
    * @returns {SyncedObject} The newly created synced object.
    * @example
    * const myObject = initializeSyncedObject("myObject", "local"};
    */
    static initializeSyncedObject(key, type, options) {
        // Check for duplicates:
        if (SyncedObjectManager.syncedObjects.has(key)) {
            return SyncedObjectManager.syncedObjects.get(key);
        }
        // Create synced object:
        const { defaultValue = {}, debounceTime = 0, reloadBehavior = "prevent", customSyncFunctions, callbackFunctions, safeMode = SyncedObjectManager.globalSafeMode } = options || {};
        const syncedObjectData = {
            key: key,
            type: type,
            data: defaultValue,
            changelog: [],
            debounceTime: debounceTime,
            reloadBehavior: reloadBehavior,
            safeMode: safeMode,
            callerId: null,
            pull: customSyncFunctions?.pull,
            push: customSyncFunctions?.push,
            onSuccess: callbackFunctions?.onSuccess,
            onError: callbackFunctions?.onError
        };
        SyncedObjectManager.validateInput("initialization", syncedObjectData);
        const syncedObject = new SyncedObject(syncedObjectData);
        // Add to storage:
        SyncedObjectManager.syncedObjects.set(key, syncedObject);
        // Initial sync:
        SyncedObjectManager.queueSyncTask(syncedObject, 0, "pull");
        // Return:
        return syncedObject;
    }
    /**
     * Find the {@link SyncedObject} with the provided key, if it exists.
     * @param {string} key Requested object key.
     * @returns {SyncedObject|undefined} The requested synced object, or undefined if nonexistent.
     * @example
     * const myObject = getSyncedObject("myObject"); // Returns undefined if 'myObject' does not exist.
     */
    static getSyncedObject(key) {
        return SyncedObjectManager.syncedObjects.get(key);
    }
    /**
     * Delete the {@link SyncedObject} with the provided key from the object manager, if it exists.
     * @param {string} key Requested object key.
     * @example
     * deleteSyncedObject("myObject"); // myObject.modify() will now throw an error.
     */
    static deleteSyncedObject(key) {
        const object = SyncedObjectManager.syncedObjects.get(key);
        if (object) {
            SyncedObjectManager.syncedObjects.delete(key);
            clearTimeout(SyncedObjectManager.pendingSyncTasks.get(key));
            SyncedObjectManager.pendingSyncTasks.delete(key);
            object.modify = function () {
                throw new SyncedObjectError(`Synced Object Modification: object with key '${key}' has been deleted.`, key, "deleteSyncedObject");
            }
            setTimeout(() => {
                SyncedObjectManager.updateComponents(object, { requestType: "delete", success: null, error: null });
            }, 0);
        }
    }
    /**
     * Update the {@link SyncedObject} data with the provided key, attempt sync, then return.
     * - Waits for any pending sync requests to finish before updating.
     * - Provides the resulting state after synchronization. 
     * @param {string} key Requested object key.
     * @param {Object|value} updater Overwrites the specified properties of `SyncedObject.data` with the provided values, or the entire field itself.
     * @returns {Promise<SyncedObject>} The updated synced object. 
     * @throws {SyncedObjectError} If the object does not exist.
     * @example
     * const myObject = await modifySyncedObject("myObject", { prop1: "new value", prop2: "new value2" });
     * console.log(myObject.data.prop1); // "new value"
     * console.log(myObject.state.success); // true
     */
    static async updateSyncedObject(key, updater) {
        // Find synced object:
        const object = SyncedObjectManager.getSyncedObject(key);
        if (!object) {
            throw new SyncedObjectError(`Synced Object Modification: object with key '${key}' does not exist.`, key, "updateSyncedObject");
        }
        // Wait for pending syncs:
        if (SyncedObjectManager.pendingSyncTasks.has(key)) {
            await new Promise(resolve => {
                const intervalId = setInterval(() => {
                    if (!SyncedObjectManager.pendingSyncTasks.has(key)) {
                        clearInterval(intervalId);
                        resolve();
                    }
                }, 100);
            });
        }
        // Modify object:
        if (typeof updater === 'object') {
            for (const [property, value] of Object.entries(updater)) {
                object.data[property] = value;
                if (!object.changelog.includes(property)) {
                    object.changelog.push(property);
                }
            }
        } else {
            object.data = updater;
        }
        // Sync object:
        setTimeout(() => {
            SyncedObjectManager.updateComponents(object, { requestType: "modify", success: null, error: object.state.error || null });
        }, 0);
        await SyncedObjectManager.forceSyncTask(object, "push");
        return object;
    }

    // Local Storage Interface:

    /**
    * Find the key or matching keys in local storage.
    * @param {string|RegExp} keyPattern The pattern to match against keys in local storage.
    * @param {"data"|"key"} [returnType="data"] Whether to return the data (default) or key matched.
    * @returns {Array<string>|Array<Object>} An array of matching keys or data objects.
    * @example
    * const keys = findInLocalStorage(/myObject/, "key");
    * console.log(keys); // ['myObject1', 'myObject2']
    */
    static findInLocalStorage(keyPattern, returnType = "data") {
        // Validate input:
        if (returnType !== "data" && returnType !== "key") {
            throw new SyncedObjectError(`Failed to find in local storage: returnType must be 'data' or 'key', found: '${returnType}'.`, keyPattern, "findInLocalStorage");
        }
        // Find keys:
        const keys = Object.keys(SyncedObjectManager.localStorage);
        let matchingKeys = [];
        if (typeof keyPattern === "string" && keyPattern.length > 0) {
            if (keys.includes(keyPattern)) {
                matchingKeys = [keyPattern];
            }
        }
        else if (keyPattern instanceof RegExp) {
            matchingKeys = keys.filter((key) => keyPattern.test(key));
        }
        else {
            throw new SyncedObjectError(`Failed to find in local storage: keyPattern must be a non-empty string or a RegExp, found: '${keyPattern}'.`, keyPattern, "findInLocalStorage");
        }
        // Return data or keys:
        if (returnType === "key") {
            return matchingKeys;
        }
        return matchingKeys.map((key) => {
            const object = JSON.parse(SyncedObjectManager.localStorage.getItem(key));
            return object;
        });
    }
    /**
    * Delete some keys from local storage.
    * @param {string|RegExp} keyPattern The pattern to match against keys in local storage.
    * @param {"ignore"|"decouple"|"delete"} [affectedObjects="ignore"] Whether to decouple, delete, or ignore any affected synced objects.
    * - `ignore`: Affected synced objects may re-push their data to local storage again.
    * - `decouple`: Affected synced objects will be decoupled from local storage, turning into 'temp' objects.
    * - `delete`: Affected synced objects will be {@link deleteSyncedObject deleted} from the manager.
    * @returns {Array<string>} An array of deleted keys.
    * @example 
    * const deletedKeys = removeFromLocalStorage("myObject1", "decouple");
    * console.log(deletedKeys); // ['myObject1']
    * console.log(getSyncedObject('myObject1')).type; // 'temp'
    */
    static removeFromLocalStorage(keyPattern, affectedObjects = "ignore") {
        // Validate input:
        if (affectedObjects !== "decouple" && affectedObjects !== "delete" && affectedObjects !== "ignore") {
            throw new SyncedObjectError(`Failed to remove from local storage: affectedObjects must be 'decouple', 'delete', 'ignore', found: '${affectedObjects}'.`, keyPattern, "removeFromLocalStorage");
        }
        // Find keys:
        const matchingKeys = SyncedObjectManager.findInLocalStorage(keyPattern, "key");
        matchingKeys.map((key) => SyncedObjectManager.localStorage.removeItem(key));
        // Handle affected objects:
        if (affectedObjects === "ignore") {
            return matchingKeys;
        }
        if (affectedObjects === "decouple") {
            matchingKeys.map((key) => { 
                const object = SyncedObjectManager.syncedObjects.get(key);
                if (object) {
                    object.type = "temp";
                }
            });
            return matchingKeys;
        }
        if (affectedObjects === "delete") {
            matchingKeys.map((key) => {
                SyncedObjectManager.deleteSyncedObject(key);
            });
            return matchingKeys;
        }
    }

    // Backend Utils:
    static async handleModifications(syncedObject, arg1, arg2) {
        // Handle modifications on the synced object.
        let property, debounceTime;
        if (typeof arg1 === "string") {
            property = arg1;
            debounceTime = (arg2 !== undefined) ? arg2 : syncedObject.debounceTime;
        }
        else {
            property = null;
            debounceTime = (arg1 !== undefined) ? arg1 : syncedObject.debounceTime;
        }
        this.validateInput("modification", { syncedObject, property, debounceTime });
        // Modify changelogs if needed:
        if (property && !syncedObject.changelog.includes(property)) {
            syncedObject.changelog.push(property);
        }
        // Rerender dependent components:
        setTimeout(() => {
            this.updateComponents(syncedObject, { requestType: "modify", success: null, error: syncedObject.state.error || null });
        }, 0);
        // Handle syncing:
        this.queueSyncTask(syncedObject, debounceTime);
    }
    static async queueSyncTask(syncedObject, debounceTime, requestType = "push") {
        // Queue an object to be pushed, debouncing multiple requests.
        clearTimeout(this.pendingSyncTasks.get(syncedObject.key));
        const timeoutId = setTimeout(async () => {
            await this.forceSyncTask(syncedObject, requestType);
            this.pendingSyncTasks.delete(syncedObject.key);
        }, debounceTime);
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
        if (syncedObject.type === "temp") {
            syncedObject.changelog = [];
            syncedObject.callerId = null;
            syncedObject.state.success = true;
            return;
        }
        const { requestType, success, error } = status;
        if (success && syncedObject.onSuccess) {
            syncedObject.onSuccess(syncedObject, status);
        }
        if (error && syncedObject.onError) {
            syncedObject.onError(syncedObject, status);
        }
        this.updateComponents(syncedObject, status);
        if (success) syncedObject.changelog = [];
        syncedObject.callerId = null;
    }
    
    // Backend Sub-Utils and Setup:
    static validateInput(name, data) {
        // Validate input for interface methods.
        if (name === "initialization") {
            if (data.safeMode === false) {
                return;
            }
            const { key, type, debounceTime, reloadBehavior, pull, push, onSuccess, onError } = data;
            // Warnings:
            if (type === "custom") {
                if (!pull && !push) {
                    console.warn(`Synced object initialization with key '${key}': customSyncFunctions not provided for 'custom' object. Use 'temp' or 'local' type instead.`);
                }
                if (reloadBehavior === "finish") {
                    console.warn(`Synced object initialization with key '${key}': reloadBehavior 'finish' might not behave as expected for asynchronous functions.`);
                }
            }
            else if (pull || push) {
                console.warn(`Synced object initialization with key '${key}': customSyncFunctions will not be run for 'temp' or 'local' objects. Use 'custom' type instead.`);
            }
            // Errors:
            const errors = [];
            if (!key || !type) {
                errors.push("missing parameters 'key' or 'type'");
            }
            else {
                if (!typeof key === "string" || key.length <= 0) {
                    errors.push("parameter 'key' must be a non-empty string");
                }
                if (type !== "temp" && type !== "local" && type !== "custom") {
                    errors.push("parameter 'type' must be either 'temp', 'local', or 'custom'");
                }
            }
            if (debounceTime && (typeof debounceTime !== "number" || debounceTime < 0)) {
                errors.push("parameter 'debounceTime' must be a non-negative number");
            }
            if (reloadBehavior && (reloadBehavior !== "prevent" && reloadBehavior !== "allow" && reloadBehavior !== "finish")) {
                errors.push("parameter 'reloadBehavior' must be either 'prevent', 'allow', or 'finish'");
            }
            if (pull && (!typeof pull === "function")) {
                errors.push("parameter 'customSyncFunctions.pull' must be a function");
            }
            if (push && (!typeof push === "function")) {
                errors.push("parameter 'customSyncFunctions.push' must be a function");
            }
            if (onSuccess && (!typeof onSuccess === "function")) {
                errors.push("parameter 'callbackFunctions.onSuccess' must be a function");
            }
            if (onError && (!typeof onError === "function")) {
                errors.push("parameter 'callbackFunctions.onError' must be a function");
            }
            if (errors.length > 0) {
                throw new SyncedObjectError(`Failed to initialize synced object:\n[${errors.join('; \n')}]`, key, "initializeSyncedObject");
            }
        }
        if (name === "modification") {
            if (data.syncedObject.safeMode === false) {
                return;
            }
            // Errors & Warnings:
            const { property, debounceTime } = data;
            const syncedObject = data.syncedObject;
            const key = syncedObject.key;
            const errors = [];
            if (property) {
                if (typeof property !== "string" || property.length <= 0) {
                    errors.push("parameter 'property' must be a non-empty string");
                }
                else {
                    if (!syncedObject.data.hasOwnProperty(property)) {
                        errors.push(`parameter 'property' must be a property of synced object with key '${key}'`);
                    }
                }
            }
            if (debounceTime && (typeof debounceTime !== "number" || debounceTime < 0)) {
                errors.push("parameter 'debounceTime' must be a non-negative number");
            }
            if (errors.length > 0) {
                throw new SyncedObjectError(`Failed to modify due to invalid params:\n[${errors.join('; \n')}]`, key, "modify");
            }
        }
    }
    static generateComponentId() {
        this.componentCounter++;
        return this.componentCounter;
    }
    static updateComponents(syncedObject, status) {
        // Update syncedObject state:
        syncedObject.state.success = status.success;
        syncedObject.state.error = status.error;
        // Rerender components with hook 'useSyncedObject':
        const event = new CustomEvent("syncedObjectEvent", { detail: {
            key: syncedObject.key,            
            changelog: syncedObject.changelog,
            requestType: status.requestType,
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


/**
 *  * @typedef {Object} User
 * @property {string} key The key associated with the synced object.
 */
/**
 * Represents a Synced Object.
 * @classdesc A Synced Object is used to manage synchronized state and behavior.
 * - Note: Do not construct this class directly - use factory function initializeSyncedObject() instead.
 */
export class SyncedObject {
    constructor(initObject) {
        const { key, type, data, changelog, debounceTime, reloadBehavior, safeMode, callerId, pull, push, onSuccess, onError } = initObject;
        if (Object.keys(initObject).length < 12) {
            throw new SyncedObjectError(`Missing parameters in SyncedObject constructor. Use factory function initializedSyncedObject() instead.`, key, "initializeSyncedObject");
        }
        this.key = key;
        this.type = type;
        this.data = data;
        this.changelog = changelog;
        this.debounceTime = debounceTime;
        this.reloadBehavior = reloadBehavior;
        this.safeMode = safeMode;
        this.callerId = callerId;
        if (pull) this.pull = pull;
        if (push) this.push = push;
        if (onSuccess) this.onSuccess = onSuccess;
        if (onError) this.onError = onError;
        this.state = {
            success: type === "temp" ? true : null,
            error: null
        };
    }

    /** 
    * The key associated with the synced object.
    * @type {string}
    */
    key;

    /**
     * The type of the synced object.
     * @type {"temp"|"local"|"custom"}
    */
    type;

    /**
     * The data of the synced object.
     * @type {*}
    */
    data;

    /**
     * The changelog of properties pending sync.
     * - Useful to rerender components with certain property dependencies.
     * - Passed to custom sync functions.
     * @type {string[]}
    */
    changelog;

    /**
     * The default sync debounce time.
     * - Used when no debounce time is provided to {@link SyncedObject.modify}.
     * - Future modify calls will reset the debounce timer.
     * @type {*}
    */
    debounceTime;

    /**
     * The behavior upon attempted application unload.
     * - `prevent`: Stops a page unload with a default popup if the object is syncing.
     * - `allow`: Allows a page unload even if the object is syncing.
     * - `finish`: Attempts to force sync before page unload.
     * @type {"prevent"|"allow"|"finish"}
    */
    reloadBehavior;

    /**
     * Whether safe mode checks and warnings are enabled. 
     * - Defaults to `true` in development, `false` in production.
     * @type {boolean}
    */
    safeMode;

    /**
     * The ID of the last component to modify this object.
     * @type {number}
     * @default null
    */
    callerId;

    /**
     * The callback function called when an object of type `custom` tries to pull data.
     * @param {SyncedObject} syncedObject The synced object itself.
     * @returns {*} The data to be pulled, or null if a push is required.
     * @throws {Error} If there is an error pulling data.
     * @type {Function}
     * @default null
    */
    pull;

    /**
     * The callback function called when an object of type `custom` tries to push data.
     * @param {SyncedObject} syncedObject The synced object itself.
     * @returns {*} Any
     * @throws {Error} If there is an error pushing data.
     * @type {Function} 
     * @default null
    */
    push;

    /**
     * The callback function called after a successful pull or push.
     * @param {SyncedObject} syncedObject The synced object itself.
     * @param {Object} status The status of the sync: { requestType, success, error }.
     * @type {Function}
     * @default null
    */
    onSuccess;

    /**
     * The callback function called after an unsuccessful pull or push.
     * @param {SyncedObject} syncedObject The synced object itself.
     * @param {Object} status The status of the sync: { requestType, success, error }.
     * @type {Function}
     * @default null
    */
    onError;

    /**
     * The state of the synced object.
     * @type {Object}
     * @property `success` Whether the last sync was successful. True, false, or null if syncing.
     * @property `error` The error of the last sync, else null.
     * @default success: null, error: null
     */
    state;

    /**
     * A member function to handle modifications to the synced object.
     * @param {string|number|undefined} arg1 (Optional) The property to modify, or debounce time. 
     * @param {number|undefined} arg2 (Optional) The debounce time, if property is provided.
     * @returns {Object} The synced object's data field.
     * @example 
     * myObject.modify(); // Modifies 'myObject' with its default sync debounce time. Handles rerenders, syncing, and callbacks.
     * myObject.modify(1000).prop1 = "new value"; // Sets myObject.data.prop1 to "new value", modifying 'myObject' with a debounce time of 1000ms.
     * myObject.modify("prop1", 1000).prop1 = "new value"; // Sets the above, while modifying `myObject.prop1' with a debounce time of 1000ms.
     */
    modify(arg1, arg2) {
        this.callerId = null;
        SyncedObjectManager.handleModifications(this, arg1, arg2);
        return this.data;
    }
}
