// An error with an HTTP status and a message that is safe to show the user.
export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
