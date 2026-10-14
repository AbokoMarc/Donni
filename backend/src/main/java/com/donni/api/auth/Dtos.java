package com.donni.api.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public final class Dtos {

    private Dtos() {
    }

    public record RegisterRequest(
            @NotBlank(message = "Nom requis") @Size(min = 2, max = 80, message = "Entre 2 et 80 caractères") String fullName,
            @NotBlank(message = "Numéro requis") @Size(max = 40, message = "Numéro invalide") String phone,
            @NotBlank(message = "Mot de passe requis") @Size(min = 8, max = 72, message = "Entre 8 et 72 caractères") String password,
            UUID deviceId) {
    }

    public record LoginRequest(
            @NotBlank(message = "Numéro requis") @Size(max = 40, message = "Numéro invalide") String phone,
            @NotBlank(message = "Mot de passe requis") @Size(max = 200, message = "Mot de passe invalide") String password,
            UUID deviceId) {
    }

    public record RefreshRequest(@NotBlank(message = "Jeton requis") @Size(max = 200) String refreshToken) {
    }

    public record ChangePasswordRequest(
            @NotBlank(message = "Mot de passe actuel requis") @Size(max = 200) String currentPassword,
            @NotBlank(message = "Nouveau mot de passe requis") @Size(min = 8, max = 72, message = "Entre 8 et 72 caractères") String newPassword) {
    }

    public record ForgotRequest(@NotBlank(message = "Numéro requis") @Size(max = 40, message = "Numéro invalide") String phone) {
    }

    public record ResetRequest(
            @NotBlank(message = "Numéro requis") @Size(max = 40, message = "Numéro invalide") String phone,
            @NotBlank(message = "Code requis") @Size(max = 12, message = "Code invalide") String code,
            @NotBlank(message = "Nouveau mot de passe requis") @Size(min = 8, max = 72, message = "Entre 8 et 72 caractères") String newPassword) {
    }

    public record DeleteAccountRequest(@NotBlank(message = "Mot de passe requis") @Size(max = 200) String password) {
    }

    public record UserSummary(UUID id, String fullName, String phone) {
    }

    public record AuthResponse(String accessToken, String refreshToken, long expiresIn, UserSummary user) {
    }

    public record MeResponse(UUID id, String fullName, String phone, Instant createdAt) {
    }
}
