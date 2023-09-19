# react-synced-object
A lightweight, efficient, and versatile package for seamless state synchronization across a React application.

# Overview
- This package provides a way to create, access, and synchronize **universal** state across React components and classes.
- It offers a simple, user-friendly alternative to state-management libraries like redux.
- Additionally, it comes with built-in features optimized for performance.

# Features
- Universal State Management: Create a `SyncedObject` with a unique key and access it from anywhere.
- Automated Synchronization: Manages synchronization tasks, including automatic rerendering of dependent components, integration with third-party APIs (e.g., databases), and seamless callback handling (e.g., error handling).
- Custom Debouncing: Defers multiple consecutive data changes into a single synchronization request.
- Local Storage Functionality: Provides utility functions for finding, removing, and deleting from the browser's local storage.

# Interface
- `SyncedObject`: A data wrapper class with a custom type, options, and methods.
- `initializeSyncedObject`: The factory function for a `SyncedObject`. 
- `useSyncedObject`: A custom React hook to interact with a `SyncedObject` from any component.
- `getSyncedObject`: A universal point of access for any `SyncedObject`.
- `deleteSyncedObject`: Rarely needed but available for certain use cases.
- `findInLocalStorage`: Utility function to retrieve from local storage.
- `removeInLocalStorage`: Utility function to delete from local storage.

# Usage
- Note: Some parameters, options, and use cases are omitted for brevity - see [below](#details) for the full breakdown.
## Setup
```javascript 
npm install react-synced-object
```
- `react-synced-object` works with any version of react with the hooks `[useState, useEffect, useMemo]`.

## Create a Synced Object
```javascript
import { initializeSyncedObject } from 'react-synced-object'
const options = { defaultValue: { myProperty: "hello world" }, debounceTime: 5000 };
const myObject = initializeSyncedObject("myObject", "local", options);
// Create a synced object with key "myObject", type "local", and the specified options.
```
- You can initialize a synced object from anywhere - at the root of your application, in a static class, or in a component. Just make sure to initialize it before trying to access it.
- Re-initializing a synced object simply returns the existing one - thus, you can initialize multiple times without worry.

## Access a Synced Object
### Access a Synced Object via getter:
```javascript
import { getSyncedObject } from 'react-synced-object';
const myObject = getSyncedObject("myObject");
console.log(myObject?.data.myProperty); // "hello world"
```
### Access a Synced Object via hook:
```javascript
import { useSyncedObject } from 'react-synced-object';
function MyComponent() {
  const { syncedObject } = useSyncedObject("myObject");
  return (
    <div>{syncedObject && syncedObject.data.myProperty}</div>
  );
}
```

## Modify a Synced Object
### Modify a Synced Object via setter:
```javascript
import { initializeSyncedObject } from 'react-synced-object';
const myObject = initializeSyncedObject("myObject", "local", options);
myObject.data = { myProperty: "hello world", myProperty2: "hello world again!" };
myObject.modify(0);
// Set data, then handle modifications to `myObject` with a sync debounce time of 0.
```
### Modify a Synced Object via hook:
```javascript
import { useSyncedObject } from 'react-synced-object';
function MyComponent() {
  const { syncedObject } = useSyncedObject("myObject");
  return (
    <input onChange={(event) => {syncedObject.modify().myProperty = event.target.value}}></input>
  );
    // Set myProperty to the input's value, then handle modifications with myObject's     debounce time of 5000 ms.
}
```
- The `modify` function immediately syncs state accross the entire application and, in this case, prepares to update local storage. 
- Other parameters and specific use cases are discussed below.

# Details
- Note: All interactables have JSDoc annotations with helpful information, as well.

## Structure
- `react-synced-object` uses a static class `SyncedObjectManager` to manage all synced objects.
- This means that synced objects will be shared across the same JavaScript environment (such as between separate tabs or windows), and will persist until page reload.
- This package was stress-tested with an upcoming full-stack application.

## SyncedObject Initialization
A `SyncedObject` is a wrapper class for data. Every instance must be initialized through `initializeSyncedObject` with a key, type, and (optional) options.

---

`key`: Any unique identifier, usually a string.

---

`type`: Either "temp", "local", or "custom".

| Type   | Description                                     |
|--------|-------------------------------------------------|
| "temp" | Temporary application-wide state - won't push or pull data.  |
| "local" | Persistent state - will interact with the browser's local storage. |
| "custom" | Customizable state - will call your custom sync functions. |
|       | A `local` or `custom` synced object will attempt to pull data upon initialization, and prepare to push data upon modification.

---
`options`: An optional object parameter with several properties.

| Property   | Description                                     |
|--------|-------------------------------------------------|
| `defaultValue` = {} | The default value of `SyncedObject.data` before the first sync. Serves as the initial value for `temp` and `local` objects.  |
| `debounceTime` = 0 | The period in ms to defer sync after `modify`. Multiple invocations will reset this timer. |
| `reloadBehavior` = "prevent" | The behavior upon attempted application unload. <ul><li>"prevent": Stops a page unload with a default popup *if* the object is pending sync. </li><li>"allow": Allows a page unload even if the object has not synced yet.</li><li>"finish": Attempts to force sync before page unload. <br></br>**Warning**: "finish" may not work as expected with custom sync functions, due to the nature of async functions and lack of callbacks.</li></ul> |
| `customSyncFunctions` = <br></br> { `pull`: undefined, `push`: undefined } | Custom synchronization callbacks invoked automatically by a `custom` synced object. <ul><li>`pull(syncedObject : SyncedObject)`: Return the requested data if successful, `null` to invoke `push` instead, or throw an error. </li><li>`push(syncedObject : SyncedObject)`: Return anything if successful, or throw an error. </li></ul> |
| `callbackFunctions` = <br></br> { `onSuccess`: undefined, `onError`: undefined } | Custom callbacks invoked after a `local` / `custom` object's pull or push attempt. <ul><li>`onSuccess(syncedObject : SyncedObject, status : {requestType, success, error})`</li><li>`onError(syncedObject : SyncedObject, status : {requestType, success, error})`</li><li> The `status` parameter contains properties `requestType`, `success`, and `error`. </li><li>`requestType` will be "pull" or "push", `success` will be true or false, and `error` will be null or an Error object.</li></ul> |
| `safeMode` = true <a name="1syncedobject-safemode"></a> | Whether to conduct initialization checks and warnings. You may disable for performance once throughly tested.  |

## SyncedObject Runtime Properties
A `SyncedObject` has several runtime properties and methods which provide useful behavior.
### `SyncedObject.data` (property) 
- This is where the information payload is stored. Access it as a normal property, change it as needed, and then call the below:
### `SyncedObject.modify` (method) 
- This is a function to signify that a change was made to `SyncedObject` data.
- It immediately updates state accross the entire application, while preparing to sync to external sources (in the case of `local` and `custom` objects).
- Additionally, it returns `SyncedObject.data`, allowing us to [chain property modifications](#modify-a-synced-object-via-hook) with the function call itself.

| Modify   | Description                                     |
|--------|-------------------------------------------------|
| `modify()` | Handle modifications with the `SyncedObject`'s default debounce time.
| `modify(1000)` | Handle modifications, specifying the debounce time in milliseconds. This will overwrite the timers of any pending sync tasks for that `SyncedObject`.
| `modify("myProperty")` | Same as `modify()`, but specifying the property being modified. This is helpful: <ol><li>For selective rerendering of `useSyncedObject` components with [ property dependencies](#optionsproperties).</li><li>To [keep track](#syncedobjectchangelog-property) of property changes when syncing a `custom` object. </li></ol>
| `modify("myProperty", 1000)` | Combining the above two calls.
### `SyncedObject.changelog` (property) 
- This array keeps track of property names modified using `modify(propertyName)`. It is automaticaly populated and cleared upon a successful push. Accessible directly from the `SyncedObject`, this property can prove useful in custom sync functions and callbacks.
### `SyncedObject.state` (property)
- An object with two properties: `success` and `error`, tracking the status of the last sync.

| Property   | Description                                     |
|--------|-------------------------------------------------|
|`success`| Whether the last sync was successful. `True`, `false`, or `null` if syncing.
|`error`| The error of the last sync, else `null`.

## useSyncedObject
- `useSyncedObject` is an easy-to-use hook for interacting with an initialized `SyncedObject` from any component.
- Traditional approaches to updating component state, such as prop chaining or Context, can lead to rerendering issues, especially when dealing with complex, nested data objects. This is due to React's shallow comparison method, which often results in either unsuccessful or unnecessary rerenders. 
- In contrast, `useSyncedObject` establishes direct dependencies to specific `SyncedObject` properties using event listeners, resulting in highly accurate and performant component updates.
```javascript
  const options = {dependencies: ["modify"], properties: ["myProperty"], safeMode: true};
  const { 
  syncedObject, 
  syncedData, 
  syncedSuccess, 
  syncedError, 
  modify 
  } = useSyncedObject("myObject", options);
  // This component will rerender when property `myProperty` of "myObject" is modified.
```
### Options
- You can specify exactly when a component should rerender, through a combination of dependent events and property names.

#### `options.dependencies`
- The conditions in which component should rerender itself. Leave undefined for the default (all events), set equal to exactly one event, or set equal to an array of events.

| Dependencies   | Description                                     |
|--------|-------------------------------------------------|
|`dependencies` = ["modify", "pull", "push", "error"] \|\| *undefined* | The default. Will rerender on every event.
|`dependencies` = [] | No dependencies. Will not rerender on any synced object event.
|`dependencies` = ["modify"] | Rerenders when the synced object is modified by any source. Overrides "modify_external".
|`dependencies` = ["modify_external"] | Rerenders when the synced object is **externally** modified, paired with [`modify`](#return-bundle) from `useSyncedObject`. Ideal for components that are already rerendering, such as an input element.
|`dependencies` = ["pull"] | Rerenders when the synced object data is pulled.
|`dependencies` = ["push"] | Rerenders when the synced object data is pushed.
|`dependencies` = ["error"] | Rerenders when the `status.error` of the synced object changes.

#### `options.properties`
- Upon `modify` or `modify_external`, the [affected properties](#syncedobjectchangelog-property) for which a component should rerender itself. Leave undefined or set as `[""]` for the default (all properties), set equal to exactly one property, or set equal to an array of properties.

| Properties   | Description                                     |
|--------|-------------------------------------------------|
|`properties` = [""] \|\| *undefined* | The default. Will rerender on any event regardless if the changelog has properties or not. <br></br> Example: `modify()` and `modify("anyProperty")`.
|`properties` = [] | Will **only** rerender if the changelog has no properties. <br></br> Example: `modify()`.
|`properties` = ["myProperty"] | Will **only** rerender if the changelog includes "myProperty". <br></br> Example: `modify("myProperty)`.
|`properties` = ["", "myProperty"] | Will rerender if the changelog includes "myProperty" or if the changelog is empty. <br></br> Example: `modify()` and `modify("myProperty")`, <br></br> Counter-Example: `modify("anotherProperty)`.

- Note that in order for a rerender to occur, both the `dependencies` and `properties` must be satisfied.

#### `options.safeMode`
- Similar to the `safeMode` option from [`initializeSyncedObject`](#syncedobject-initialization) - default `true`.

### Return Bundle
- Most of `useSyncedObject` returns are aliases to `SyncedObject` properties. However, `modify` has a special use case.

| Return Value   | Description                                     |
|--------|-------------------------------------------------|
| syncedObject | Equivalent to `getSyncedObject`. Either `SyncedObject` or null.
| syncedData | Equivalent to `SyncedObject.data`, or null.
| syncedSuccess | Equivalent to [`SyncedObject.state.success`](#syncedobjectstate-property), or null.
| syncedError | Equivalent to [`SyncedObject.state.error`](#syncedobjectstate-property), or null.
| modify | Similar to `SyncedObject.modify`, if `SyncedObject` exists. <ul><li>This version of `modify` records the component that triggered the modification.</li><li>This is intended to be used in tandem with the "modify_external" [dependency](#optionsdependencies).</li></ul>

## Other Utility Functions

### findInLocalStorage(keyPattern, returnType = "key")
```javascript
const myKeys = findInLocalStorage(\myObject\);
console.log(myKeys); // ['myObject1', 'myObject2']
```
- `findInLocalStorage` will search in local storage for an exact string match or regex pattern, and return an array of keys (`returnType = "key"`) or data objects (`returnType = "data"`).

### removeFromLocalStorage(keyPattern, affectedObjects = "ignore")
```javascript
const deletedKeys = removeFromLocalStorage(\myObject\);
console.log(deletedKeys); // ['myObject1', 'myObject2']
```
- `removeFromLocalStorage` will also search in local storage, deleting any matches, and handling any affected objects.
  - `affectedObjects = ignore`: Does not delete the objects - they may re-push their data to local storage again.
  - `affectedObjects = decouple`: The affected objects will be decoupled from local storage, turning into `temp` objects.
  - `affectedObjects = delete`: The affected objects will be deleted from the manager.

### deleteSyncedObject(key)
```javascript
deleteSyncedObject("myObject");
```
- `deleteSyncedObject` deletes an initialized `SyncedObject` with the given key from the manager. It also updates dependent components and prevents further `modify` calls.
- Be wary when deleting an `SyncedObject` initialized inside a component - it could be reinitialized.

# Outro
- Feel free to comment or bug report [here](https://github.com/aaronkwan/react-synced-object/issues). 
- Happy Coding!

