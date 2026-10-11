---
id: AngularRateLimiterOptions
title: AngularRateLimiterOptions
---

Defined in: [packages/angular-pacer/src/rate-limiter/injectRateLimiter.ts:26](https://github.com/TanStack/pacer/blob/main/packages/angular-pacer/src/rate-limiter/injectRateLimiter.ts#L26)

Options for [injectRateLimiter](../functions/injectRateLimiter.md), including core configuration and Angular cleanup.

## Extends

- `RateLimiterOptions`\<`TFn`\>

## Type Parameters

### TFn

`TFn` *extends* `AnyFunction`

## Properties

### onUnmount?

```ts
optional onUnmount?: (core) => void;
```

Defined in: [packages/angular-pacer/src/rate-limiter/injectRateLimiter.ts:33](https://github.com/TanStack/pacer/blob/main/packages/angular-pacer/src/rate-limiter/injectRateLimiter.ts#L33)

Called when the owning injection context is destroyed. Receives the core instance.
There is no default cleanup; use this callback for custom teardown.

#### Parameters

##### core

`RateLimiter`\<`TFn`\>

#### Returns

`void`
