export interface ApiErrorBody {
  status?: number;
  code?: string;
  message?: string;
  fields?: Record<string, string>;
  server?: unknown;
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly fields: Record<string, string> | undefined;
  readonly server: unknown;

  constructor(status: number, body: ApiErrorBody = {}) {
    super(body.message ?? `Erreur ${status}`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'ApiError';
    this.status = status;
    this.code = body.code ?? 'unknown';
    this.fields = body.fields;
    this.server = body.server;
  }
}

export class NetworkError extends Error {
  constructor(message = 'Connexion impossible') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'NetworkError';
  }
}

/** Le refresh a échoué : l'utilisateur doit se reconnecter, les données locales restent intactes. */
export class AuthExpiredError extends Error {
  constructor(message = 'Session expirée') {
    super(message);
    Object.setPrototypeOf(this, new.target.prototype);
    this.name = 'AuthExpiredError';
  }
}

const MESSAGES: Record<string, string> = {
  invalid_credentials: 'Numéro ou mot de passe incorrect.',
  phone_taken: 'Ce numéro est déjà associé à un compte.',
  rate_limited: 'Trop de tentatives. Réessayez dans une minute.',
  reset_channel_unavailable:
    "La réinitialisation par WhatsApp n'est pas disponible sur ce serveur.",
  invalid_reset_code: 'Code invalide ou expiré.',
  unauthorized: 'Votre session a expiré. Reconnectez-vous.',
  token_expired: 'Votre session a expiré. Reconnectez-vous.',
  refresh_reused: 'Votre session a été fermée par sécurité. Reconnectez-vous.',
  forbidden: "Cette action n'est pas autorisée.",
  not_found: 'Élément introuvable.',
  internal_error: 'Le serveur a rencontré un problème. Réessayez plus tard.',
};

export function messageFor(error: unknown): string {
  if (error instanceof NetworkError) {
    return 'Connexion impossible. Vérifiez votre réseau et l’adresse du serveur.';
  }
  if (error instanceof AuthExpiredError) {
    return MESSAGES.unauthorized;
  }
  if (error instanceof ApiError) {
    if (error.code === 'validation_failed' && error.fields) {
      const first = Object.values(error.fields)[0];
      if (first) {
        return first;
      }
    }
    return MESSAGES[error.code] ?? error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Une erreur est survenue.';
}
