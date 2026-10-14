package com.donni.api.common;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.Optional;

import org.junit.jupiter.api.Test;

class PhoneNumbersTest {

    @Test
    void addsCameroonPrefixToNineDigitNumbersStartingWithSix() {
        assertEquals(Optional.of("+237600000000"), PhoneNumbers.normalize("600000000"));
        assertEquals(Optional.of("+237670000000"), PhoneNumbers.normalize("6 70 00 00 00"));
    }

    @Test
    void keepsInternationalNumbers() {
        assertEquals(Optional.of("+237600000000"), PhoneNumbers.normalize("+237 600-000-000"));
        assertEquals(Optional.of("+237600000000"), PhoneNumbers.normalize("00237600000000"));
        assertEquals(Optional.of("+33612345678"), PhoneNumbers.normalize("+33 6 12 34 56 78"));
        assertEquals(Optional.of("+237600000000"), PhoneNumbers.normalize("237600000000"));
    }

    @Test
    void rejectsInvalidNumbers() {
        assertTrue(PhoneNumbers.normalize(null).isEmpty());
        assertTrue(PhoneNumbers.normalize("").isEmpty());
        assertTrue(PhoneNumbers.normalize("abc").isEmpty());
        assertTrue(PhoneNumbers.normalize("12345").isEmpty());
        assertTrue(PhoneNumbers.normalize("700000000").isEmpty());
        assertTrue(PhoneNumbers.normalize("+0600000000").isEmpty());
        assertTrue(PhoneNumbers.normalize("+2376000000001234567").isEmpty());
    }

    @Test
    void whatsAppIdentifierHasNoPlus() {
        assertEquals("237600000000", PhoneNumbers.toWhatsAppId("+237600000000"));
    }
}
