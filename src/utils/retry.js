// ═══════════════════════════════════════════════════════════════════
// retry.js — Exponential Backoff Wrapper (Alternative zu p-retry)
// ═══════════════════════════════════════════════════════════════════

async function retryWithBackoff(fn, options = {}) {
  const {
    retries = 3,
    minTimeout = 1000,
    maxTimeout = 30000,
    factor = 2,
    onFailedAttempt = () => {}
  } = options;
  
  let lastError;
  for (let attempt = 1; attempt <= retries + 1; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      err.attemptNumber = attempt;
      onFailedAttempt(err);
      
      if (attempt > retries) throw err;
      
      const delay = Math.min(minTimeout * Math.pow(factor, attempt - 1), maxTimeout);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw lastError;
}

module.exports = { retryWithBackoff };
