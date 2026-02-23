import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './Welcome.module.css';

/**
 * Parses a user-supplied invite string into a { host, token } pair.
 *
 * Accepted formats:
 *   https://myserver.com/invite/abc123   → { host: "https://myserver.com", token: "abc123" }
 *   http://192.168.1.5:3000/invite/tok  → { host: "http://192.168.1.5:3000", token: "tok" }
 *   abc123                              → { host: window.location.origin, token: "abc123" }
 */
function parseInvite(raw: string): { host: string; token: string } | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // Try as a full URL first
  try {
    const url = new URL(trimmed);
    const parts = url.pathname.split('/').filter(Boolean);
    // Expect path like /invite/<token>
    const invIdx = parts.indexOf('invite');
    if (invIdx !== -1 && parts[invIdx + 1]) {
      const host = url.origin;
      const token = parts[invIdx + 1];
      return { host, token };
    }
  } catch { /* not a URL — fall through */ }

  // Treat as a bare token, assume same-origin server
  if (/^[a-zA-Z0-9_-]+$/.test(trimmed)) {
    return { host: window.location.origin, token: trimmed };
  }

  return null;
}

export function Welcome() {
  const navigate = useNavigate();
  const [value, setValue] = useState('');
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    const parsed = parseInvite(value);
    if (!parsed) {
      setError('Enter a valid invite link (e.g. https://myserver.com/invite/abc123) or invite code.');
      return;
    }

    navigate(`/invite/${parsed.token}?host=${encodeURIComponent(parsed.host)}`);
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.card}>

        <div className={styles.wordmark}>
          <span className={styles.logo}>Spectrus</span>
          <p className={styles.tagline}>Your community. Your server.</p>
        </div>

        <div className={styles.divider} />

        <div className={styles.section}>
          <h2 className={styles.heading}>Join a server</h2>
          <p className={styles.hint}>
            Paste an invite link from a Spectrus server to get started.
          </p>

          <form className={styles.form} onSubmit={handleSubmit} noValidate>
            <input
              className="input"
              type="text"
              placeholder="https://myserver.com/invite/abc123"
              autoFocus
              autoComplete="off"
              spellCheck={false}
              value={value}
              onChange={(e) => {
                setValue(e.target.value);
                if (error) setError('');
              }}
            />

            {error && (
              <p className={styles.error} role="alert">{error}</p>
            )}

            <button
              type="submit"
              className={`btn btn-primary ${styles.submitBtn}`}
              disabled={!value.trim()}
            >
              Continue
            </button>
          </form>
        </div>

      </div>
    </div>
  );
}
