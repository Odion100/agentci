const RETRYABLE_STATUS = [408, 429];

function isRetryable(error) {
  const status = error?.status ?? error?.response?.status;
  if (status && (status >= 500 || RETRYABLE_STATUS.includes(status))) return true;
  return error?.error?.type === "overloaded_error";
}

export default async function withRetry(fn, retries) {
  const attempts = typeof retries === "number" ? retries : retries?.attempts || 0;
  const baseDelay = retries?.baseDelay || 500;
  let lastError;
  for (let attempt = 0; attempt <= attempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === attempts || !isRetryable(error)) throw error;
      await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** attempt));
    }
  }
  throw lastError;
}
