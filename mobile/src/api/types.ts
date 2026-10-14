export interface AuthUser {
  id: string;
  fullName: string;
  phone: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  user: AuthUser;
}

export interface Me extends AuthUser {
  createdAt: string;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
