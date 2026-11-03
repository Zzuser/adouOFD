package com.adou.ofd.web;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ApiTokenTest {

    @Test
    void acceptsAnyValueWhenProtectionDisabled() {
        assertTrue(ApiToken.matches("", null));
        assertTrue(ApiToken.matches("", "anything"));
    }

    @Test
    void rejectsMissingToken() {
        assertFalse(ApiToken.matches("secret-token", null));
    }

    @Test
    void acceptsMatchingToken() {
        assertTrue(ApiToken.matches("secret-token", "secret-token"));
    }

    @Test
    void rejectsMismatchedToken() {
        assertFalse(ApiToken.matches("secret-token", "other-token"));
    }
}
