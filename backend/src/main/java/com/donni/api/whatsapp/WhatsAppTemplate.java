package com.donni.api.whatsapp;

public enum WhatsAppTemplate {

    TEST("donni_test", 0, false),
    TASK_REMINDER("donni_rappel_tache", 2, false),
    GOAL_REMINDER("donni_rappel_objectif", 1, false),
    CONTACT_REMINDER("donni_rappel_contact", 1, false),
    ROUTINE_REMINDER("donni_rappel_routine", 1, false),
    RESET_CODE("donni_code_reinitialisation", 1, true);

    public static final String LANGUAGE = "fr";

    private final String metaName;
    private final int parameterCount;
    private final boolean sensitive;

    WhatsAppTemplate(String metaName, int parameterCount, boolean sensitive) {
        this.metaName = metaName;
        this.parameterCount = parameterCount;
        this.sensitive = sensitive;
    }

    public String metaName() {
        return metaName;
    }

    public int parameterCount() {
        return parameterCount;
    }

    /** Les paramètres d'un modèle sensible ne sont jamais conservés en base. */
    public boolean sensitive() {
        return sensitive;
    }
}
