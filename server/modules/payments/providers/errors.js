/**
 * A provider call that didn't go through. `definite` is true when the
 * provider certainly did not accept the request (refused, bad request, not
 * reachable at all), so nothing can have moved; false when it may have got
 * there (timeout, server error) and only a status check can tell.
 */
export class ProviderError extends Error {
  constructor(message, { definite = true, status = null } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.definite = definite;
    this.status = status;
  }
}
