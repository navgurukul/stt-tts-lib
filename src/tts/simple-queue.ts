/**
 * stt-tts-lib - Speech-to-Text and Text-to-Speech Library
 * Copyright (C) 2026 Navgurukul
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU Affero General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
 * GNU Affero General Public License for more details.
 *
 * You should have received a copy of the GNU Affero General Public License
 * along with this program. If not, see <https://www.gnu.org/licenses/>.
 */

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
