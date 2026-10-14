package com.donni.api.sync;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import com.donni.api.common.ApiException;
import com.fasterxml.jackson.databind.ObjectMapper;

class SyncRequestParserTest {

    private final EntitySpecs specs = new EntitySpecs();
    private final ObjectMapper mapper = new ObjectMapper();

    private SyncRequestParser.ParsedRequest parse(String json) throws Exception {
        return SyncRequestParser.parse(mapper.readTree(json), specs);
    }

    private static final String ID = "6f1c2b1a-1d2e-4f3a-9b4c-5d6e7f8a9b0c";

    @Test
    void parsesChangesAndDeletions() throws Exception {
        var request = parse("""
                {"cursor":120,"deviceId":"%s","changes":[
                 {"entity":"goals","id":"%s","baseVersion":0,"deleted":false,"data":{"title":"A","status":"todo"}},
                 {"entity":"goals","id":"%s","baseVersion":37,"deleted":true,"data":{}}]}""".formatted(ID, ID, ID));
        assertEquals(120, request.cursor());
        assertEquals(2, request.changes().size());
        assertTrue(request.changes().get(1).deleted());
    }

    @Test
    void emptyBodyMeansNothingToPush() throws Exception {
        var request = parse("{}");
        assertEquals(0, request.cursor());
        assertTrue(request.changes().isEmpty());
    }

    @Test
    void unknownEntityRejectsTheWholeRequest() {
        ApiException e = assertThrows(ApiException.class, () -> parse("""
                {"changes":[{"entity":"widgets","id":"%s","baseVersion":0,"data":{}}]}""".formatted(ID)));
        assertEquals(422, e.status().value());
        assertTrue(e.fields().containsKey("changes[0].entity"));
    }

    @Test
    void oneInvalidFieldRejectsTheWholeRequest() {
        ApiException e = assertThrows(ApiException.class, () -> parse("""
                {"changes":[
                 {"entity":"goals","id":"%s","baseVersion":0,"data":{"title":"A","status":"todo"}},
                 {"entity":"goals","id":"%s","baseVersion":0,"data":{"title":"B","status":"fini"}}]}""".formatted(ID, ID)));
        assertTrue(e.fields().containsKey("changes[1].data.status"));
    }

    @Test
    void protocolNamesAreCamelCase() {
        assertThrows(ApiException.class, () -> parse("""
                {"changes":[{"entity":"goal-steps","id":"%s","baseVersion":0,"data":{}}]}""".formatted(ID)));
    }

    @Test
    void refusesMoreThanTwoHundredChanges() {
        String change = "{\"entity\":\"notes\",\"id\":\"" + ID + "\",\"baseVersion\":0,\"data\":{\"title\":\"\",\"body\":\"\"}}";
        String body = "{\"changes\":[" + String.join(",", java.util.Collections.nCopies(201, change)) + "]}";
        ApiException e = assertThrows(ApiException.class, () -> parse(body));
        assertTrue(e.fields().containsKey("changes"));
    }

    @Test
    void rejectsNegativeCursorAndBadIds() {
        assertThrows(ApiException.class, () -> parse("{\"cursor\":-1}"));
        assertThrows(ApiException.class, () -> parse("""
                {"changes":[{"entity":"goals","id":"nope","baseVersion":0,"deleted":true}]}"""));
    }
}
