# react-synced-object
A lightweight, efficient, and versatile package for seamless state synchronization across a React application.

## Overview
- This package provides a way to create, access, and synchronize **universal** state across React components and classes.
- It offers a simple, user-friendly alternative to state-management libraries like redux.
- Additionally, it comes with built-in features optimized for performance.

## Features
- Universal State Management: Create a `SyncedObject` with a unique key and access it from anywhere.
- Automated Synchronization: Manages synchronization tasks, including automatic rerendering of dependent components, integration with third-party APIs (e.g., databases), and seamless callback handling (e.g., error handling).
- Custom Debouncing: Defers multiple consecutive data changes into a single synchronization request.
- Local Storage Functionality: Provides utility functions for finding, removing, and deleting from the browser's local storage.

## Interface
- `SyncedObject`: A data wrapper class with a custom type, options, and methods.
- `initializeSyncedObject`: The factory function for `SyncedObject`s. 
- `useSyncedObject`: A custom React hook to interact with a `SyncedObject` from any component.
- `getSyncedObject`: A universal point of access for any `SyncedObject`.
- `deleteSyncedObject`: Rarely needed but available for certain use cases.
- `findInLocalStorage`: Utility function to retrieve from local storage.
- `removeInLocalStorage`: Utility function to delete from local storage.

## Usage
- Note: Some parameters, options, and use cases are omitted for brevity - see [below](#details) for the full breakdown.
### Setup
```npm install react-synced-object```

### Create a Synced Object
```javascript
import { initializeSyncedObject } from 'react-synced-object'
const options = { defaultValue: { myProperty: "hello world" }, debounceTime: 5000 };
// Create a synced object with key "myObject", type "local", and the specified options:
const myObject = initializeSyncedObject("myObject", "local", options);
```
- You can initialize a synced object from anywhere - at the root of your application, in a static class, or in a component. Just make sure to initialize it before trying to access it.
- Initializing a synced object again simply returns the existing one - thus, you can initialize multiple times without worry.

### Access a Synced Object
#### Access a Synced Object via getter:
```javascript
import { getSyncedObject } from 'react-synced-object';
const myObject = getSyncedObject("myObject");
console.log(myObject?.data.myProperty); // "hello world"
```
#### Access a Synced Object via hook:
```javascript
import { useSyncedObject } from 'react-synced-object';
function MyComponent() {
  const { syncedObject } = useSyncedObject("myObject");
  return (
    <div>{syncedObject && syncedObject.data.myProperty}</div>
  );
}
```

### Modify a Synced Object
#### Modify a Synced Object via setter:
```javascript
import { initializeSyncedObject } from 'react-synced-object';
const myObject = initializeSyncedObject("myObject", "local", options);
// Set data, then handle modifications to `myObject` with a sync debounce time of 0:
myObject.data = { myProperty: "hello world", myProperty2: "hello world again!" };
myObject.modify(0);
```
#### Modify a Synced Object via hook:
```javascript
import { useSyncedObject } from 'react-synced-object';
function MyComponent() {
  const { syncedObject, modify } = useSyncedObject("myObject");
  // Set myProperty to the user's input, then handle modifications with myObject's debounce time of 5000 ms:
  return (
    <input onChange={(event) => {syncedObject.modify().myProperty = event.target.value}}></input>
  );
}
```
- In both examples, we call a `modify` function, which syncs state across the entire application, and in this case, to local storage as well.
- `modify()` returns `SyncedObject.data`, meaning we can chain a property modification with the actual function call.
- `modify` from `useSyncedObject` and the `modify` method of `myObject` itself are actually quite similar - the difference arises in a single `useSyncedObject` hook option, discussed below.

## Details
- Note: All interactables have JSDoc annotations with helpful information, as well.

### Structure
- `react-synced-object` uses a static class `SyncedObjectManager` to manage all synced objects.
- This means that synced objects will be shared across the same JavaScript environment (such as between separate tabs or windows), and will persist until page reload.
- This package was stress-tested with an upcoming full-stack application.

### SyncedObject
A `SyncedObject` is a wrapper class for data. Every instance must be initialized through `initializeSyncedObject` with a key and type.
- `key`: Any unique identifier, usually a string.
- `type`: Either "temp", "local", or "custom".
  - `temp`: Intended for application-wide state, such as form data, temporary preferences, and other data that refreshes every session. `temp` objects don't push or pull data.
  - `local`: Intended for persistent data, such as authentication status, user-specific options, and other data that should persist across sessions. `local` objects automatically pull from / push to the browser's local storage.
  - `custom`: A customizable version of a `temp` object, intended for state such as user profiles, page content, and other data that should interact with third-party APIs. `custom` objects automatically call your custom functions, `push` and `pull`.



Happy Coding!

