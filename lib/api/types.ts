export type Authority = { name: string; email: string; level: number };

export type ApiErrorCode =
  | "NOT_AUTHORIZED" // Google account is valid but not in the authority list
  | "INVALID_TOKEN"  // Google token failed verification
  | "UNAUTHENTICATED"
  | "NETWORK"
  | "UNKNOWN";

export class ApiError extends Error {
  constructor(public code: ApiErrorCode, public status = 0) {
    super(code);
  }
}
