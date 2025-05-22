import NodeCache from 'node-cache';

// Interface that could later be implemented with Redis
export interface CacheService {
  get<T>(key: string): T | undefined;
  set<T>(key: string, value: T, ttl?: number): boolean;
  del(key: string): number;
  keys(): string[];
  flush(): void;
}

// Implementation using NodeCache
export class NodeCacheService implements CacheService {
  private cache: NodeCache;

  constructor(options?: NodeCache.Options) {
    this.cache = new NodeCache(options || { 
      stdTTL: 3600, // Default TTL: 1 hour
      checkperiod: 600 // Check for expired keys every 10 minutes
    });
  }

  get<T>(key: string): T | undefined {
    return this.cache.get<T>(key);
  }

  set<T>(key: string, value: T, ttl?: number): boolean {
    // If ttl is undefined, use the default TTL from NodeCache
    return ttl !== undefined ? this.cache.set<T>(key, value, ttl) : this.cache.set<T>(key, value);
  }

  del(key: string): number {
    return this.cache.del(key);
  }

  keys(): string[] {
    return this.cache.keys();
  }

  flush(): void {
    this.cache.flushAll();
  }
}

// Create a singleton instance
export const cacheService = new NodeCacheService();