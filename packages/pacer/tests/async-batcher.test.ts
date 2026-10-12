import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AsyncBatcher, asyncBatch } from '../src/async-batcher'
import { createDeferredFactory } from './test-utils'

describe('AsyncBatcher', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()

    vi.clearAllTimers()
    vi.useRealTimers()
  })

  describe('State Management', () => {
    it('should initialize with default state', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, {})

      expect(batcher.store.state.errorCount).toBe(0)
      expect(batcher.store.state.failedItems).toEqual([])
      expect(batcher.store.state.isEmpty).toBe(true)
      expect(batcher.store.state.isExecuting).toBe(false)
      expect(batcher.store.state.isPending).toBe(false)
      expect(batcher.store.state.items).toEqual([])
      expect(batcher.store.state.lastResult).toBeUndefined()
      expect(batcher.store.state.settleCount).toBe(0)
      expect(batcher.store.state.size).toBe(0)
      expect(batcher.store.state.status).toBe('idle')
      expect(batcher.store.state.successCount).toBe(0)
      expect(batcher.store.state.totalItemsFailed).toBe(0)
      expect(batcher.store.state.totalItemsProcessed).toBe(0)
    })

    it('should accept initial state values', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, {
        initialState: {
          successCount: 5,
          totalItemsProcessed: 10,
        },
      })

      expect(batcher.store.state.successCount).toBe(5)
      expect(batcher.store.state.totalItemsProcessed).toBe(10)
      expect(batcher.store.state.isEmpty).toBe(true)
      expect(batcher.store.state.size).toBe(0)
    })

    it('should update state when items are added', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

      batcher.addItem('test')

      expect(batcher.store.state.isEmpty).toBe(false)
      expect(batcher.store.state.size).toBe(1)
      expect(batcher.store.state.items).toEqual(['test'])
      expect(batcher.store.state.isPending).toBe(true)
      expect(batcher.store.state.status).toBe('pending')
    })

    it('should compute status correctly based on state', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 5 })

      // idle when empty
      expect(batcher.store.state.status).toBe('idle')

      // populated when has items but no wait
      batcher.addItem(1)
      expect(batcher.store.state.status).toBe('populated')
    })

    it('should track execution state during async processing', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 2 })

      // Add item without triggering execution (since maxSize is 2)
      batcher.addItem(1)
      expect(batcher.store.state.isExecuting).toBe(false)
      expect(batcher.store.state.status).toBe('populated')

      // Use flush to trigger execution and wait for completion
      const executionPromise = batcher.flush()
      expect(batcher.store.state.isExecuting).toBe(true)
      expect(batcher.store.state.status).toBe('executing')

      await executionPromise
      expect(batcher.store.state.isExecuting).toBe(false)
      expect(batcher.store.state.status).toBe('idle')
    })

    it('should update success count and result after successful execution', async () => {
      const mockFn = vi.fn().mockResolvedValue('test-result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 2 })

      batcher.addItem(1)
      batcher.addItem(2)
      await vi.runAllTimersAsync()

      expect(batcher.store.state.successCount).toBe(1)
      expect(batcher.store.state.settleCount).toBe(1)
      expect(batcher.store.state.lastResult).toBe('test-result')
      expect(batcher.store.state.totalItemsProcessed).toBe(2)
    })

    it('should update error count and failed items after failed execution', async () => {
      const mockFn = vi.fn().mockRejectedValue(new Error('test error'))
      const batcher = new AsyncBatcher(mockFn, {
        maxSize: 2,
        onError: () => {}, // Prevent throwing
        throwOnError: false,
      })

      batcher.addItem(1)
      batcher.addItem(2)
      await vi.runAllTimersAsync()

      expect(batcher.store.state.errorCount).toBe(1)
      expect(batcher.store.state.settleCount).toBe(1)
      expect(batcher.store.state.successCount).toBe(0)
      expect(batcher.store.state.failedItems).toEqual([1, 2])
      expect(batcher.store.state.totalItemsFailed).toBe(2)
    })

    it('should wait for a timer-triggered batch and return its result from addItem', async () => {
      using deferred = createDeferredFactory('batch result')
      const execution = deferred()
      const batcher = new AsyncBatcher(
        (_items: Array<string>) => execution.promise,
        { wait: 10 },
      )

      // Should be setteled with the result.
      let addItemSettled = false
      const addItemResult = batcher.addItem('job').then((result) => {
        addItemSettled = true
        return result
      })

      // Start the batch, but leave its result unresolved.
      await vi.advanceTimersByTimeAsync(10)
      expect(addItemSettled).toBe(false)
      // Finish the batch.
      execution.resolve('batch result')
      // addItem should return that same result.
      expect(await addItemResult).toBe('batch result')
    })

    it('should not let a timer from before reset execute newly queued manual-only items', async () => {
      const fn = vi.fn(async (_items: Array<string>) => {})
      const batcher = new AsyncBatcher(fn, { wait: 100 })
      const first = batcher.addItem('old')
      await vi.advanceTimersByTimeAsync(50)

      batcher.reset()
      batcher.setOptions({ wait: Infinity })
      await batcher.addItem('new')
      await vi.advanceTimersByTimeAsync(50)
      await first

      // Initial item should be discarted.
      expect(fn).not.toHaveBeenCalled()
      // New item should be in the batch that isn't pending.
      expect(batcher.store.state.items).toEqual(['new'])
      expect(batcher.store.state.isPending).toBe(false)
    })

    it('should abort a newer execution after reset and an older execution settles', async () => {
      using deferred = createDeferredFactory('finished')
      const firstRun = deferred()
      const secondRun = deferred()
      const onSuccess = vi.fn()
      const fn = vi
        .fn<(_items: Array<string>) => Promise<string>>()
        .mockReturnValueOnce(firstRun.promise)
        .mockReturnValueOnce(secondRun.promise)
      const batcher = new AsyncBatcher(fn, { wait: Infinity, onSuccess })

      batcher.addItem('first')
      const first = batcher.flush()
      // Reset the tracked promises, only the second should be tracked.
      batcher.reset()
      batcher.addItem('second')
      const second = batcher.flush()

      expect(fn).toHaveBeenCalledTimes(2)

      // Resolve first one. The effect of this on the test isn't asserted
      // but not having an earlier first run will not show the issue.
      firstRun.resolve('first result')
      await first
      // Abort the batch, so B should not end up calling onSucess.
      batcher.abort()
      secondRun.resolve('second result')
      await second

      expect(onSuccess.mock.calls.map(([result]) => result)).not.toContain(
        'second result',
      )
    })

    it('should keep isExecuting true until every overlapping execution settles', async () => {
      using deferred = createDeferredFactory('finished')
      const firstRun = deferred()
      const secondRun = deferred()
      const fn = vi
        .fn<(_items: Array<string>) => Promise<string>>()
        .mockReturnValueOnce(firstRun.promise)
        .mockReturnValueOnce(secondRun.promise)
      const utility = new AsyncBatcher(fn, { wait: Infinity })

      utility.addItem('first')
      const first = utility.flush()
      utility.addItem('second')
      const second = utility.flush()

      expect(fn).toHaveBeenCalledTimes(2)
      expect(utility.store.state.isExecuting).toBe(true)

      secondRun.resolve('second result')
      await second

      // Even when one batch ended, it still should be executing
      expect(utility.store.state.isExecuting).toBe(true)

      firstRun.resolve('first result')
      await first

      expect(utility.store.state.isExecuting).toBe(false)
    })
  })

  describe('Options Behavior', () => {
    it('should use default options when not specified', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, {})

      expect(batcher.options.maxSize).toBe(Infinity)
      expect(batcher.options.wait).toBe(Infinity)
      expect(batcher.options.started).toBe(true)
      expect(batcher.options.throwOnError).toBe(true)
      expect(typeof batcher.options.getShouldExecute).toBe('function')
    })

    it('should respect maxSize option', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 2 })

      batcher.addItem(1)
      expect(mockFn).not.toHaveBeenCalled()

      batcher.addItem(2)
      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledWith([1, 2])
    })

    it('should respect wait option', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

      batcher.addItem(1)
      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(999)
      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1)
      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledWith([1])
    })

    it('should support dynamic wait function', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const waitFn = vi.fn().mockReturnValue(500)
      const batcher = new AsyncBatcher(mockFn, { wait: waitFn })

      batcher.addItem(1)
      expect(waitFn).toHaveBeenCalledWith(batcher)

      vi.advanceTimersByTime(500)
      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledWith([1])
    })

    it('should use getShouldExecute for custom execution logic', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const getShouldExecute = vi.fn().mockReturnValue(true)
      const batcher = new AsyncBatcher(mockFn, { getShouldExecute })

      batcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(getShouldExecute).toHaveBeenCalledWith([1], batcher)
      expect(mockFn).toHaveBeenCalledWith([1])
    })

    it('should call onSuccess callback after successful execution', async () => {
      const mockFn = vi.fn().mockResolvedValue('test-result')
      const onSuccess = vi.fn()
      const batcher = new AsyncBatcher(mockFn, { maxSize: 1, onSuccess })

      batcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(onSuccess).toHaveBeenCalledWith('test-result', [1], batcher)
    })

    it('should call onError callback after failed execution', async () => {
      const error = new Error('test error')
      const mockFn = vi.fn().mockRejectedValue(error)
      const onError = vi.fn()
      const batcher = new AsyncBatcher(mockFn, {
        maxSize: 1,
        onError,
        throwOnError: false,
      })

      batcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(onError).toHaveBeenCalledWith(error, [1], batcher)
    })

    it('should call onSettled callback after execution regardless of outcome', async () => {
      const onSettled = vi.fn()

      // Test with successful execution
      const successFn = vi.fn().mockResolvedValue('result')
      const successBatcher = new AsyncBatcher(successFn, {
        maxSize: 1,
        onSettled,
      })

      successBatcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(onSettled).toHaveBeenCalledWith([1], successBatcher)

      // Test with failed execution
      onSettled.mockClear()
      const errorFn = vi.fn().mockRejectedValue(new Error('test'))
      const errorBatcher = new AsyncBatcher(errorFn, {
        maxSize: 1,
        onSettled,
        onError: () => {},
        throwOnError: false,
      })

      errorBatcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(onSettled).toHaveBeenCalledWith([1], errorBatcher)
    })

    it('should call onItemsChange callback when items change', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const onItemsChange = vi.fn()
      const batcher = new AsyncBatcher(mockFn, { onItemsChange })

      batcher.addItem(1)
      expect(onItemsChange).toHaveBeenCalledWith(batcher)
    })

    it('should default throwOnError based on onError presence', () => {
      const mockFn = vi.fn().mockResolvedValue('result')

      // No onError handler - should throw by default
      const batcher1 = new AsyncBatcher(mockFn, {})
      expect(batcher1.options.throwOnError).toBe(true)

      // With onError handler - should not throw by default
      const batcher2 = new AsyncBatcher(mockFn, { onError: () => {} })
      expect(batcher2.options.throwOnError).toBe(false)

      // Explicit throwOnError should override default
      const batcher3 = new AsyncBatcher(mockFn, {
        onError: () => {},
        throwOnError: true,
      })
      expect(batcher3.options.throwOnError).toBe(true)
    })

    it('should update options with setOptions', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 5 })

      expect(batcher.options.maxSize).toBe(5)

      batcher.setOptions({ maxSize: 10 })
      expect(batcher.options.maxSize).toBe(10)
    })
  })

  describe('Method Execution', () => {
    describe('addItem', () => {
      it('should add item to the batch', () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

        batcher.addItem('test')

        expect(batcher.store.state.items).toEqual(['test'])
        expect(batcher.store.state.size).toBe(1)
      })

      it('should add multiple items in order', () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

        batcher.addItem(1)
        batcher.addItem(2)
        batcher.addItem(3)

        expect(batcher.store.state.items).toEqual([1, 2, 3])
      })

      it('should trigger execution when maxSize is reached', async () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { maxSize: 2 })

        batcher.addItem(1)
        batcher.addItem(2)
        await vi.runAllTimersAsync()

        expect(mockFn).toHaveBeenCalledWith([1, 2])
        expect(batcher.store.state.items).toEqual([])
      })

      it('should clear existing timeout when new item is added', async () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

        batcher.addItem(1)
        vi.advanceTimersByTime(500)

        batcher.addItem(2)
        vi.advanceTimersByTime(500)
        expect(mockFn).not.toHaveBeenCalled()

        vi.advanceTimersByTime(500)
        await vi.runAllTimersAsync()

        expect(mockFn).toHaveBeenCalledWith([1, 2])
      })
    })

    describe('flush', () => {
      it('should execute batch immediately', async () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

        batcher.addItem(1)
        batcher.addItem(2)

        expect(mockFn).not.toHaveBeenCalled()

        const result = await batcher.flush()
        expect(mockFn).toHaveBeenCalledWith([1, 2])
        expect(result).toBe('result')
      })

      it('should clear pending timeout when flushing', async () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

        batcher.addItem(1)
        await batcher.flush()

        // Advance time to ensure timeout would have fired
        vi.advanceTimersByTime(1000)
        await vi.runAllTimersAsync()

        expect(mockFn).toHaveBeenCalledTimes(1)
      })

      it('should return undefined when batch is empty', async () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, {})

        const result = await batcher.flush()
        expect(mockFn).not.toHaveBeenCalled()
        expect(result).toBeUndefined()
      })

      it('should handle errors during flush', async () => {
        const error = new Error('test error')
        const mockFn = vi.fn().mockRejectedValue(error)
        const batcher = new AsyncBatcher(mockFn, {
          onError: () => {},
          throwOnError: false,
        })

        batcher.addItem(1)
        const result = await batcher.flush()

        expect(result).toBeUndefined()
        expect(batcher.store.state.errorCount).toBe(1)
      })
    })

    describe('peekAllItems', () => {
      it('should return copy of all items without removing them', () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

        batcher.addItem(1)
        batcher.addItem(2)

        const items = batcher.peekAllItems()
        expect(items).toEqual([1, 2])
        expect(batcher.store.state.items).toEqual([1, 2])

        // Ensure it's a copy, not the same array
        items.push(3)
        expect(batcher.store.state.items).toEqual([1, 2])
      })

      it('should return empty array when no items', () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, {})

        expect(batcher.peekAllItems()).toEqual([])
      })
    })

    describe('peekFailedItems', () => {
      it('should return copy of failed items', async () => {
        const mockFn = vi.fn().mockRejectedValue(new Error('test'))
        const batcher = new AsyncBatcher(mockFn, {
          maxSize: 2,
          onError: () => {},
          throwOnError: false,
        })

        batcher.addItem(1)
        batcher.addItem(2)
        await vi.runAllTimersAsync()

        const failedItems = batcher.peekFailedItems()
        expect(failedItems).toEqual([1, 2])

        // Ensure it's a copy
        failedItems.push(3)
        expect(batcher.store.state.failedItems).toEqual([1, 2])
      })

      it('should return empty array when no failed items', () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const batcher = new AsyncBatcher(mockFn, {})

        expect(batcher.peekFailedItems()).toEqual([])
      })
    })

    describe('clear', () => {
      it('should remove all items and failed items from batch', async () => {
        const mockFn = vi.fn().mockRejectedValue(new Error('test'))
        const batcher = new AsyncBatcher(mockFn, {
          wait: 1000,
          onError: () => {},
          throwOnError: false,
        })

        batcher.addItem(1)
        batcher.addItem(2)
        await batcher.flush() // This will fail and add to failedItems

        batcher.addItem(3)
        batcher.addItem(4)

        expect(batcher.store.state.items).toEqual([3, 4])
        expect(batcher.store.state.failedItems).toEqual([1, 2])

        batcher.clear()

        expect(batcher.store.state.items).toEqual([])
        expect(batcher.store.state.failedItems).toEqual([])
        expect(batcher.store.state.size).toBe(0)
        expect(batcher.store.state.isEmpty).toBe(true)
        expect(batcher.store.state.isPending).toBe(false)
      })
    })

    describe('reset', () => {
      it('should reset all state to defaults', async () => {
        const mockFn = vi.fn().mockResolvedValue('result')
        const onItemsChange = vi.fn()
        const batcher = new AsyncBatcher(mockFn, { maxSize: 2, onItemsChange })

        batcher.addItem(1)
        batcher.addItem(2) // Triggers execution
        await vi.runAllTimersAsync()

        expect(batcher.store.state.successCount).toBe(1)
        expect(batcher.store.state.totalItemsProcessed).toBe(2)

        batcher.reset()

        expect(batcher.store.state.errorCount).toBe(0)
        expect(batcher.store.state.failedItems).toEqual([])
        expect(batcher.store.state.isEmpty).toBe(true)
        expect(batcher.store.state.isExecuting).toBe(false)
        expect(batcher.store.state.isPending).toBe(false)
        expect(batcher.store.state.items).toEqual([])
        expect(batcher.store.state.lastResult).toBeUndefined()
        expect(batcher.store.state.settleCount).toBe(0)
        expect(batcher.store.state.size).toBe(0)
        expect(batcher.store.state.status).toBe('idle')
        expect(batcher.store.state.successCount).toBe(0)
        expect(batcher.store.state.totalItemsFailed).toBe(0)
        expect(batcher.store.state.totalItemsProcessed).toBe(0)
        expect(onItemsChange).toHaveBeenCalledWith(batcher)
      })
    })
  })

  describe('Error Handling', () => {
    it('should track error statistics correctly', async () => {
      const mockFn = vi
        .fn()
        .mockResolvedValueOnce('success1')
        .mockRejectedValueOnce(new Error('error1'))
        .mockResolvedValueOnce('success2')
        .mockRejectedValueOnce(new Error('error2'))

      const batcher = new AsyncBatcher(mockFn, {
        maxSize: 1,
        onError: () => {},
        throwOnError: false,
      })

      // First batch - success
      batcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(batcher.store.state.successCount).toBe(1)
      expect(batcher.store.state.errorCount).toBe(0)
      expect(batcher.store.state.settleCount).toBe(1)

      // Second batch - error
      batcher.addItem(2)
      await vi.runAllTimersAsync()

      expect(batcher.store.state.successCount).toBe(1)
      expect(batcher.store.state.errorCount).toBe(1)
      expect(batcher.store.state.settleCount).toBe(2)

      // Third batch - success
      batcher.addItem(3)
      await vi.runAllTimersAsync()

      expect(batcher.store.state.successCount).toBe(2)
      expect(batcher.store.state.errorCount).toBe(1)
      expect(batcher.store.state.settleCount).toBe(3)

      // Fourth batch - error
      batcher.addItem(4)
      await vi.runAllTimersAsync()

      expect(batcher.store.state.successCount).toBe(2)
      expect(batcher.store.state.errorCount).toBe(2)
      expect(batcher.store.state.settleCount).toBe(4)
    })
  })

  describe('Edge Cases', () => {
    it('should handle rapid consecutive adds with maxSize', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 3 })

      batcher.addItem(1)
      batcher.addItem(2)
      batcher.addItem(3) // Should trigger
      batcher.addItem(4)
      batcher.addItem(5)
      batcher.addItem(6) // Should trigger again

      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenNthCalledWith(1, [1, 2, 3])
      expect(mockFn).toHaveBeenNthCalledWith(2, [4, 5, 6])
    })

    it('should handle getShouldExecute returning false', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const getShouldExecute = vi.fn().mockReturnValue(false)
      const batcher = new AsyncBatcher(mockFn, { getShouldExecute, wait: 1000 })

      batcher.addItem(1)
      expect(getShouldExecute).toHaveBeenCalledWith([1], batcher)
      expect(mockFn).not.toHaveBeenCalled()

      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledWith([1])
    })

    it('should handle execution with empty items array', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, {})

      const result = await batcher.flush()
      expect(mockFn).not.toHaveBeenCalled()
      expect(result).toBeUndefined()
    })

    it('should handle wait: Infinity (no timeout)', () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { wait: Infinity })

      batcher.addItem(1)
      expect(batcher.store.state.isPending).toBe(false)

      vi.advanceTimersByTime(10000)
      expect(mockFn).not.toHaveBeenCalled()
    })

    it('should handle multiple timeouts correctly', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { wait: 1000 })

      batcher.addItem(1)
      vi.advanceTimersByTime(500)

      batcher.addItem(2)
      vi.advanceTimersByTime(500)

      batcher.addItem(3)
      vi.advanceTimersByTime(1000)
      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith([1, 2, 3])
    })

    it('should preserve item order during batch execution', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 5 })

      batcher.addItem('a')
      batcher.addItem('b')
      batcher.addItem('c')
      batcher.addItem('d')
      batcher.addItem('e')

      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledWith(['a', 'b', 'c', 'd', 'e'])
    })

    it('should handle concurrent execution attempts', async () => {
      const mockFn = vi.fn().mockResolvedValue('result')
      const batcher = new AsyncBatcher(mockFn, { maxSize: 2 })

      batcher.addItem(1)
      batcher.addItem(2) // Triggers execution

      // Try to flush while already executed
      const result = await batcher.flush()

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(mockFn).toHaveBeenCalledWith([1, 2])
      expect(result).toBeUndefined() // flush returns undefined when no items
    })

    it('should handle async function that returns non-promise', async () => {
      const mockFn = vi.fn().mockReturnValue('sync-result')
      const batcher = new AsyncBatcher(mockFn as any, { maxSize: 1 })

      batcher.addItem(1)
      await vi.runAllTimersAsync()

      expect(mockFn).toHaveBeenCalledWith([1])
      expect(batcher.store.state.lastResult).toBe('sync-result')
    })

    it('should handle execution during isExecuting state', async () => {
      let resolvePromise: (value: any) => void
      const promise = new Promise((resolve) => {
        resolvePromise = resolve
      })
      const mockFn = vi.fn().mockReturnValue(promise)
      const batcher = new AsyncBatcher(mockFn, { maxSize: 1 })

      // Start first execution
      batcher.addItem(1)
      expect(batcher.store.state.isExecuting).toBe(true)

      // Try to flush while executing
      const flushPromise = batcher.flush()

      // Complete the execution
      resolvePromise!('result')
      await promise
      const flushResult = await flushPromise

      expect(mockFn).toHaveBeenCalledTimes(1)
      expect(flushResult).toBeUndefined()
    })
  })
})

describe('asyncBatch', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('should create and return async batcher addItem function', async () => {
    const mockFn = vi.fn().mockResolvedValue('result')
    const batchItems = asyncBatch(mockFn, { maxSize: 2 })

    expect(typeof batchItems).toBe('function')

    batchItems(1)
    batchItems(2)

    await vi.runAllTimersAsync()

    expect(mockFn).toHaveBeenCalledWith([1, 2])
  })

  it('should work with different options', async () => {
    const mockFn = vi.fn().mockResolvedValue('result')
    const batchItems = asyncBatch(mockFn, { wait: 1000 })

    batchItems('test')

    expect(mockFn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1000)
    await vi.runAllTimersAsync()

    expect(mockFn).toHaveBeenCalledWith(['test'])
  })

  it('should handle errors in batch function', async () => {
    const mockFn = vi.fn().mockRejectedValue(new Error('test error'))
    const batchItems = asyncBatch(mockFn, {
      maxSize: 1,
      onError: () => {},
      throwOnError: false,
    })

    batchItems(1)

    await vi.runAllTimersAsync()

    // The error should be handled by the onError callback
    expect(mockFn).toHaveBeenCalledTimes(1)
    expect(mockFn).toHaveBeenCalledWith([1])
  })

  describe('getAbortSignal', () => {
    it('should be available as an instance method', () => {
      const batcher = new AsyncBatcher(
        async (items) => {
          return items
        },
        { maxSize: 10, wait: 100 },
      )

      expect(typeof batcher.getAbortSignal).toBe('function')
      expect(batcher.getAbortSignal()).toBeNull()
    })
  })
})
