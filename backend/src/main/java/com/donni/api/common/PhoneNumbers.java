package com.donni.api.common;

import java.util.Optional;
import java.util.regex.Pattern;

public final class PhoneNumbers {

    private static final Pattern SEPARATORS = Pattern.compile("[\\s.\\-()]");
    private static final Pattern E164 = Pattern.compile("\\+[1-9][0-9]{7,14}");
    private static final Pattern LOCAL_CM = Pattern.compile("6[0-9]{8}");
    private static final Pattern INTERNATIONAL_DIGITS = Pattern.compile("[1-9][0-9]{9,14}");

    private PhoneNumbers() {
    }

    public static Optional<String> normalize(String raw) {
        if (raw == null) {
            return Optional.empty();
        }
        String cleaned = SEPARATORS.matcher(raw.strip()).replaceAll("");
        if (cleaned.startsWith("00")) {
            cleaned = "+" + cleaned.substring(2);
        } else if (LOCAL_CM.matcher(cleaned).matches()) {
            cleaned = "+237" + cleaned;
        } else if (INTERNATIONAL_DIGITS.matcher(cleaned).matches()) {
            cleaned = "+" + cleaned;
        }
        return E164.matcher(cleaned).matches() ? Optional.of(cleaned) : Optional.empty();
    }

    public static String toWhatsAppId(String e164) {
        return e164.substring(1);
    }
}
