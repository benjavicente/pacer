import { effect, isSignal, linkedSignal, untracked } from '@angular/core'
import { injectQueuer } from './injectQueuer'
import type { Signal } from '@angular/core'
import type { QueuePosition, QueuerState } from '@tanstack/pacer/queuer'
import type { AngularQueuer, AngularQueuerOptions } from './injectQueuer'

export interface QueuedValueSignal<TValue, TSelected = {}> {
  (): TValue
  /**
   * Adds an item to the queue.
   *
   * @example
   * ```ts
   * queued.addItem('task')
   * queued.addItem('task2', 'front')
   * ```
   */
  addItem: (
    item: TValue,
    position?: QueuePosition,
    runOnItemsChange?: boolean,
  ) => boolean
  queuer: AngularQueuer<TValue, TSelected>
}

function resolveValue<TValue>(value: TValue | Signal<TValue>): TValue {
  return isSignal(value) ? value() : value
}

/**
 * An Angular function that creates a queued value that processes state changes in order with an optional delay.
 * This function uses injectQueuer internally to manage a queue of state changes and apply them sequentially.
 *
 * The queued value will process changes in the order they are received, with optional delays between
 * processing each change. This is useful for handling state updates that need to be processed
 * in a specific order, like animations or sequential UI updates.
 *
 * The function returns a callable object containing:
 * - `queued()`: A signal-like function that provides the current queued value
 * - `queued.addItem(...)`: A method to enqueue additional values
 * - `queued.queuer`: The queuer instance with control methods and the selected state signal
 *
 * @example
 * ```ts
 * const queued = injectQueuedValue(initialValue, {
 *   wait: 500,
 *   started: true,
 * })
 *
 * // Add changes to the queue
 * queued.addItem('new value')
 * ```
 */
export function injectQueuedValue<
  TValue,
  TSelected = {},
>(
  initialValue: TValue | Signal<TValue>,
  options: AngularQueuerOptions<TValue, TSelected> = {},
  selector?: (state: QueuerState<TValue>) => TSelected,
): QueuedValueSignal<TValue, TSelected> {
  const queuedValue = linkedSignal<TValue>(() =>
    untracked(() => resolveValue(initialValue)),
  )

  const queuer = injectQueuer<TValue, TSelected>(
    (item) => {
      queuedValue.set(item)
    },
    options,
    selector,
  )

  effect(() => {
    queuer.addItem(resolveValue(initialValue))
  })

  return Object.assign(queuedValue, {
    addItem: queuer.addItem.bind(queuer),
    queuer,
  }) as QueuedValueSignal<TValue, TSelected>
}
