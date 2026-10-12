/** Creates controlled promises and releases any remaining ones on disposal. */
export function createDeferredFactory<T>(cleanupValue: T) {
  const resolvers: Array<(value: T | PromiseLike<T>) => void> = []

  return Object.assign(
    () => {
      let resolve!: (value: T | PromiseLike<T>) => void
      let reject!: (reason?: unknown) => void
      const promise = new Promise<T>((done, fail) => {
        resolve = done
        reject = fail
      })
      resolvers.push(resolve)
      return { promise, resolve, reject }
    },
    {
      [Symbol.dispose]() {
        for (const resolve of resolvers) {
          resolve(cleanupValue)
        }
      },
    },
  )
}
