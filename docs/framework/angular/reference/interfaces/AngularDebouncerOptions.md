---
id: AngularDebouncerOptions
title: AngularDebouncerOptions
---

Defined in: [packages/angular-pacer/src/debouncer/injectDebouncer.ts:27](https://github.com/TanStack/pacer/blob/main/packages/angular-pacer/src/debouncer/injectDebouncer.ts#L27)

Options for [injectDebouncer](../functions/injectDebouncer.md), including core configuration and Angular cleanup.

## Extends

- `DebouncerOptions`\<`TFn`\>

## Type Parameters

### TFn

`TFn` *extends* `AnyFunction` = `AnyFunction`

## Properties

### onUnmount?

```ts
optional onUnmount?: (core) => void;
```

Defined in: [packages/angular-pacer/src/debouncer/injectDebouncer.ts:34](https://github.com/TanStack/pacer/blob/main/packages/angular-pacer/src/debouncer/injectDebouncer.ts#L34)

Called when the owning injection context is destroyed. Receives the core instance.
Providing this callback replaces the default cleanup (cancel pending execution).

#### Parameters

##### core

`Debouncer`\<`TFn`\>

#### Returns

`void`
