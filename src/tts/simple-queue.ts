/**
 * SimpleQueue for audio buffer management
 */

export class SimpleQueue<T> {
  private items: T[] = [];
  private resolvers: ((value: T) => void)[] = [];

  /**
   * Add an item to the queue
   */
  enqueue(item: T): void {
    const resolver = this.resolvers.shift();
    if (resolver) {
      resolver(item);
    } else {
      this.items.push(item);
    }
  }

  /**
   * Get an item from the queue (async - waits if empty)
   */
  async dequeue(): Promise<T> {
    const item = this.items.shift();
    if (item !== undefined) {
      return item;
    }

    return new Promise<T>((resolve) => {
      this.resolvers.push(resolve);
    });
  }

  /**
   * Get current queue size
   */
  size(): number {
    return this.items.length;
  }

  /**
   * Check if queue is empty
   */
  isEmpty(): boolean {
    return this.items.length === 0;
  }

  /**
   * Clear all items and pending resolvers
   */
  clear(): void {
    this.items = [];
    this.resolvers = [];
  }
}
