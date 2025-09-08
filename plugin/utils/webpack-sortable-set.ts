const NONE = Symbol("not sorted");

/**
 * A subset of Set that offers sorting functionality
 */
export class SortableSet<T> extends Set<T> {
  private _sortFn?: (a: T, b: T) => number;
  private _lastActiveSortFn: typeof NONE | ((a: T, b: T) => number);
  private _cache: Map<(set: SortableSet<T>) => any, any> | undefined;
  private _cacheOrderIndependent:
    | Map<(set: SortableSet<T>) => any, any>
    | undefined;

  /**
   * Create a new sortable set
   */
  constructor(
    initialIterable?: Iterable<T>,
    defaultSort?: (a: T, b: T) => number
  ) {
    super(initialIterable);
    this._sortFn = defaultSort;
    this._lastActiveSortFn = NONE;
    this._cache = undefined;
    this._cacheOrderIndependent = undefined;
  }

  add(value: T) {
    this._lastActiveSortFn = NONE;
    this._invalidateCache();
    this._invalidateOrderedCache();
    super.add(value);
    return this;
  }

  delete(value: T) {
    this._invalidateCache();
    this._invalidateOrderedCache();
    return super.delete(value);
  }

  clear() {
    this._invalidateCache();
    this._invalidateOrderedCache();
    return super.clear();
  }

  sortWith(sortFn: (a: T, b: T) => number) {
    if (this.size <= 1 || sortFn === this._lastActiveSortFn) {
      // already sorted - nothing to do
      return;
    }

    const sortedArray = [...this].sort(sortFn);
    super.clear();
    for (let i = 0; i < sortedArray.length; i += 1) {
      super.add(sortedArray[i]);
    }
    this._lastActiveSortFn = sortFn;
    this._invalidateCache();
  }

  sort() {
    if (!this._sortFn) return this;

    this.sortWith(this._sortFn);
    return this;
  }

  getFromCache(fn: (set: SortableSet<T>) => any) {
    if (this._cache === undefined) {
      this._cache = new Map();
    } else {
      const result = this._cache.get(fn);
      const data = /** @type {R} */ result;
      if (data !== undefined) {
        return data;
      }
    }
    const newData = fn(this);
    this._cache.set(fn, newData);
    return newData;
  }

  getFromUnorderedCache(fn: (set: SortableSet<T>) => any) {
    if (this._cacheOrderIndependent === undefined) {
      this._cacheOrderIndependent = new Map();
    } else {
      const result = this._cacheOrderIndependent.get(fn);
      const data = /** @type {R} */ result;
      if (data !== undefined) {
        return data;
      }
    }
    const newData = fn(this);
    this._cacheOrderIndependent.set(fn, newData);
    return newData;
  }

  _invalidateCache() {
    if (this._cache !== undefined) {
      this._cache.clear();
    }
  }

  _invalidateOrderedCache() {
    if (this._cacheOrderIndependent !== undefined) {
      this._cacheOrderIndependent.clear();
    }
  }

  toJSON() {
    return [...this];
  }
}
