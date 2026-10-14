package com.donni.api.security;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.concurrent.atomic.AtomicLong;

import org.junit.jupiter.api.Test;

class TokenBucketLimiterTest {

    private final AtomicLong clock = new AtomicLong();
    private final TokenBucketLimiter limiter = new TokenBucketLimiter(10, 60, clock::get);

    @Test
    void allowsTheCapacityThenRefuses() {
        for (int i = 0; i < 10; i++) {
            assertTrue(limiter.tryAcquire("ip:1"));
        }
        assertFalse(limiter.tryAcquire("ip:1"));
    }

    @Test
    void keysAreIndependent() {
        for (int i = 0; i < 10; i++) {
            limiter.tryAcquire("ip:1");
        }
        assertTrue(limiter.tryAcquire("ip:2"));
    }

    @Test
    void refillsOverTime() {
        for (int i = 0; i < 10; i++) {
            limiter.tryAcquire("ip:1");
        }
        assertFalse(limiter.tryAcquire("ip:1"));
        clock.addAndGet(6_100_000_000L);
        assertTrue(limiter.tryAcquire("ip:1"));
        assertFalse(limiter.tryAcquire("ip:1"));
    }

    @Test
    void neverExceedsCapacityAfterALongPause() {
        clock.addAndGet(3_600_000_000_000L);
        for (int i = 0; i < 10; i++) {
            assertTrue(limiter.tryAcquire("ip:1"));
        }
        assertFalse(limiter.tryAcquire("ip:1"));
    }
}
