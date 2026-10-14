package com.donni.api.security;

import java.util.concurrent.ConcurrentHashMap;
import java.util.function.LongSupplier;

public final class TokenBucketLimiter {

    private static final int PURGE_THRESHOLD = 20_000;

    private final int capacity;
    private final double refillPerNano;
    private final LongSupplier nanoClock;
    private final ConcurrentHashMap<String, Bucket> buckets = new ConcurrentHashMap<>();

    public TokenBucketLimiter(int capacity, long refillPeriodSeconds, LongSupplier nanoClock) {
        this.capacity = capacity;
        this.refillPerNano = (double) capacity / (refillPeriodSeconds * 1_000_000_000d);
        this.nanoClock = nanoClock;
    }

    public boolean tryAcquire(String key) {
        long now = nanoClock.getAsLong();
        if (buckets.size() > PURGE_THRESHOLD) {
            purge(now);
        }
        Bucket bucket = buckets.computeIfAbsent(key, k -> new Bucket(capacity, now));
        synchronized (bucket) {
            bucket.refill(now, refillPerNano, capacity);
            if (bucket.tokens >= 1d) {
                bucket.tokens -= 1d;
                return true;
            }
            return false;
        }
    }

    public long secondsUntilNextToken() {
        return Math.max(1L, (long) Math.ceil(1d / (refillPerNano * 1_000_000_000d)));
    }

    int size() {
        return buckets.size();
    }

    private void purge(long now) {
        buckets.entrySet().removeIf(entry -> {
            Bucket bucket = entry.getValue();
            synchronized (bucket) {
                bucket.refill(now, refillPerNano, capacity);
                return bucket.tokens >= capacity;
            }
        });
    }

    private static final class Bucket {
        private double tokens;
        private long lastRefill;

        Bucket(double tokens, long lastRefill) {
            this.tokens = tokens;
            this.lastRefill = lastRefill;
        }

        void refill(long now, double refillPerNano, int capacity) {
            long elapsed = now - lastRefill;
            if (elapsed > 0) {
                tokens = Math.min(capacity, tokens + elapsed * refillPerNano);
                lastRefill = now;
            }
        }
    }
}
