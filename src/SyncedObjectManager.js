export class SyncedObjectManager {
    // Vars:
    static localStorage = window.localStorage;
    static syncedObjects = new Map();
    static pendingSyncTasks = new Map();
    static componentCounter = 0;

    // Main Interface:
    /**
    * Initialize a new {@link SyncedObject} using provided options.
    * @param {string} key The synced object's identifier.
    * @param {"temp"|"local"|"custom"} type The type of synced object, affecting sync behavior.
    * @param {Object} [options] - The options for initializing the synced object.
    * @param {Object} [options.defaultValue={}] - The default value for the synced object.
    * @param {number} [options.debounceTime=0] - The debounce time for modifications.
    * @param {"prevent"|"allow"|"finish"} [options.reloadBehavior="prevent"] - The reload behavior.
    * @param {Object} [options.customSyncFunctions] - Custom synchronization functions.
    * @param {Object} [options.callbackFunctions] - Callback functions for synchronization events.
    * @param {boolean} [options.safeMode=true] - Whether safe mode is enabled.
    * @returns {SyncedObject} The newly created synced object.
    * @example
    * const myObject = SyncedObjectManager.initializeSyncedObject("myObject", "local"};
    */
    static initializeSyncedObject(key, type, options) {
        // Check for duplicates:
        if (SyncedObjectManager.syncedObjects.has(key)) {
            return SyncedObjectManager.syncedObjects.get(key);
        }
        // Create synced object:
        const { defaultValue = {}, debounceTime = 0, reloadBehavior = "prevent", customSyncFunctions, callbackFunctions, safeMode = true } = options || {};
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
        SyncedObjectManager.forceSyncTask(syncedObject, "pull");
        // Return:
        return syncedObject;
    }
    /**
     * Find the {@link SyncedObject} with the provided key, if it exists.
     * @param {string} key Requested object key.
     * @returns {SyncedObject|undefined} The requested synced object, or undefined if nonexistent.
     * @example
     * const myObject = SyncedObjectManager.getSyncedObject("myObject"); // Returns undefined if 'myObject' does not exist.
     */
    static getSyncedObject(key) {
        return SyncedObjectManager.syncedObjects.get(key);
    }
    /**
     * Delete the {@link SyncedObject} with the provided key from the object manager, if it exists.
     * @param {string} key Requested object key.
     * @example
     * SyncedObjectManager.deleteSyncedObject("myObject"); // myObject.modify() will now do nothing.
     */
    static deleteSyncedObject(key) {
        const object = SyncedObjectManager.syncedObjects.get(key);
        if (object) {
            object.modify = function () {
                console.warn(`Synced Object Modification: object with key '${this.key}' has been deleted.`);
            }
            SyncedObjectManager.syncedObjects.delete(key);
        }
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
            debounceTime = arg2 || syncedObject.debounceTime;
        }
        else {
            property = null;
            debounceTime = arg1 || syncedObject.debounceTime;
        }
        this.validateInput("modification", { syncedObject, property, debounceTime });
        // Modify changelogs if needed:
        if (property && !syncedObject.changelog.includes(property)) {
            syncedObject.changelog.push(property);
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
            if (!typeof key === "string" || key.length <= 0) {
                errors.push("parameter 'key' must be a non-empty string");
            }
            if (type !== "temp" && type !== "local" && type !== "custom") {
                errors.push("parameter 'type' must be either 'temp', 'local', or 'custom'");
            }
            if (debounceTime && (typeof debounceTime !== "number" || debounceTime < 0)) {
                console.log(debounceTime);
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
     * @type {string[]}
    */
    changelog;

    /**
     * The default sync debounce time.
     * @type {*}
    */
    debounceTime;

    /**
     * The behavior on reload of the synced object.
     * @type {"prevent"|"allow"|"finish"}
    */
    reloadBehavior;

    /**
     * Whether safe mode checks and warnings are enabled.
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
     * The callback function called after a successful sync.
     * @param {SyncedObject} syncedObject The synced object itself.
     * @param {Object} status The status of the sync: { requestType, success, error }.
     * @type {Function}
     * @default null
    */
    onSuccess;

    /**
     * The callback function called after an unsuccessful sync.
     * @param {SyncedObject} syncedObject The synced object itself.
     * @param {Object} status The status of the sync: { requestType, success, error }.
     * @type {Function}
     * @default null
    */
    onError;

    /**
     * A member function to handle modifications to the synced object.
     * @param {string|number|undefined} arg1 (Optional) The property to modify, or debounce time. 
     * @param {number|undefined} arg2 (Optional) The debounce time, if property is provided.
     * @returns {Object} The synced object's data field.
     * @example 
     * myObject.modify(); // Modifies 'myObject' with its default sync debounce time. Handles rerenders, syncing, and callbacks.
     * myObject.modify(1000).prop1 = "new value"; // Sets myObject.data.prop1 to "new value", modifying 'myObject' with a debounce time of 1000ms.
     * myObject.modify("prop1", 1000); // Modifies 'myObject.prop1', with a debounce time of 1000ms.
     */
    modify(arg1, arg2) {
        SyncedObjectManager.handleModifications(this, arg1, arg2);
        return this.data;
    }
}
