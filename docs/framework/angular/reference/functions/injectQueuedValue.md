---
id: injectQueuedValue
title: injectQueuedValue
---

# Function: injectQueuedValue()

```ts
function injectQueuedValue<TValue, TSelected>(
   initialValue, 
   options,
selector?): QueuedValueSignal<TValue, TSelected>;
```

Defined in: [queuer/injectQueuedValue.ts:54](https://github.com/TanStack/pacer/blob/main/packages/angular-pacer/src/queuer/injectQueuedValue.ts#L54)

An Angular function that creates a queued value that processes state changes in order with an optional delay.
This function uses injectQueuer internally to manage a queue of state changes and apply them sequentially.

The queued value will process changes in the order they are received, with optional delays between
processing each change. This is useful for handling state updates that need to be processed
in a specific order, like animations or sequential UI updates.

The function returns a callable object containing:
- `queued()`: A signal-like function that provides the current queued value
- `queued.addItem(...)`: A method to enqueue additional values
- `queued.queuer`: The queuer instance with control methods and the selected state signal

## Type Parameters

### TValue

`TValue`

### TSelected

`TSelected` = \{
\}

## Parameters

### initialValue

`TValue` | `Signal`\<`TValue`\>

### options

[`AngularQueuerOptions`](../interfaces/AngularQueuerOptions.md)\<`TValue`, `TSelected`\> = `{}`

### selector?

(`state`) => `TSelected`

## Returns

[`QueuedValueSignal`](../interfaces/QueuedValueSignal.md)\<`TValue`, `TSelected`\>

## Example

```ts
const queued = injectQueuedValue(initialValue, {
  wait: 500,
  started: true,
})

// Add changes to the queue
queued.addItem('new value')
```
