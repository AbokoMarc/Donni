package com.donni.api.sync;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.util.Map;

import org.junit.jupiter.api.Test;

import com.donni.api.sync.SyncRules.Action;
import com.donni.api.sync.SyncRules.Incoming;
import com.donni.api.sync.SyncRules.Stored;

class SyncRulesTest {

    private static final Map<String, Object> DATA = Map.of("title", "Sport");
    private static final Map<String, Object> OTHER = Map.of("title", "Lecture");

    @Test
    void insertsUnknownRecordWhateverTheBaseVersion() {
        assertEquals(Action.INSERT, SyncRules.decide(null, new Incoming(0, false, DATA)));
        assertEquals(Action.INSERT, SyncRules.decide(null, new Incoming(37, false, DATA)));
    }

    @Test
    void deletionOfUnknownRecordIsANoop() {
        assertEquals(Action.NOOP_DELETE, SyncRules.decide(null, new Incoming(5, true, Map.of())));
    }

    @Test
    void updatesWhenBaseVersionMatches() {
        assertEquals(Action.UPDATE, SyncRules.decide(new Stored(10, false, DATA), new Incoming(10, false, OTHER)));
    }

    @Test
    void conflictWhenBaseVersionDiffersAndContentDiffers() {
        assertEquals(Action.CONFLICT, SyncRules.decide(new Stored(12, false, DATA), new Incoming(10, false, OTHER)));
    }

    @Test
    void retryWithIdenticalContentIsAcknowledged() {
        assertEquals(Action.UNCHANGED, SyncRules.decide(new Stored(12, false, DATA), new Incoming(0, false, DATA)));
        assertEquals(Action.UNCHANGED, SyncRules.decide(new Stored(12, false, DATA), new Incoming(10, false, DATA)));
    }

    @Test
    void deletionWithMatchingVersionCreatesTombstone() {
        assertEquals(Action.TOMBSTONE, SyncRules.decide(new Stored(10, false, DATA), new Incoming(10, true, Map.of())));
    }

    @Test
    void deletionRetryOnTombstoneIsAcknowledged() {
        assertEquals(Action.UNCHANGED, SyncRules.decide(new Stored(15, true, DATA), new Incoming(10, true, Map.of())));
        assertEquals(Action.UNCHANGED, SyncRules.decide(new Stored(15, true, DATA), new Incoming(15, true, Map.of())));
    }

    @Test
    void deletionOfRecordChangedElsewhereIsAConflict() {
        assertEquals(Action.CONFLICT, SyncRules.decide(new Stored(15, false, OTHER), new Incoming(10, true, Map.of())));
    }

    @Test
    void editingATombstoneWithStaleVersionIsAConflict() {
        assertEquals(Action.CONFLICT, SyncRules.decide(new Stored(15, true, DATA), new Incoming(10, false, DATA)));
    }

    @Test
    void editingATombstoneWithCurrentVersionRestoresIt() {
        assertEquals(Action.UPDATE, SyncRules.decide(new Stored(15, true, DATA), new Incoming(15, false, DATA)));
    }
}
