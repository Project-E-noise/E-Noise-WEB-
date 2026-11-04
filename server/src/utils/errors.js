export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const badRequest = (message, details) => new ApiError(400, message, details);
export const unauthorized = message => new ApiError(401, message || "Authentication required.");
export const forbidden = message => new ApiError(403, message || "Not allowed.");
export const notFound = message => new ApiError(404, message || "Not found.");
export const conflict = message => new ApiError(409, message || "Conflict.");
export const gone = message => new ApiError(410, message || "This link has expired.");
