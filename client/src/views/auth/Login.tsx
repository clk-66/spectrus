import { useState, type FormEvent } from 'react';
import { useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { login } from '../../api/auth';
import { useAuthStore } from '../../stores/useAuthStore';
import styles from './Auth.module.css';

// ---- Validation ----------------------------------------------------------

interface FieldErrors {
  username?: string;
  password?: string;
}

function validate(username: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!username.trim()) {
    errors.username = 'Username is required.';
  } else if (username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  return errors;
}

// ---- Component -----------------------------------------------------------

export function Login() {
  const navigate       = useNavigate();
  const location       = useLocation();
  const [searchParams] = useSearchParams();
  const setAuth        = useAuthStore((s) => s.setAuth);

  // The server this login belongs to — passed as ?host= by JoinServer.
  const host = searchParams.get('host') ?? window.location.origin;
  // Redirect back to the originating route after login (e.g. /invite/:token?join=1)
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [username,     setUsername]     = useState('');
  const [password,     setPassword]     = useState('');
  const [fieldErrors,  setFieldErrors]  = useState<FieldErrors>({});
  const [formError,    setFormError]    = useState('');
  const [loading,      setLoading]      = useState(false);
  const [touched,      setTouched]      = useState(false);

  function revalidate(u = username, p = password) {
    if (touched) setFieldErrors(validate(u, p));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFormError('');

    const errs = validate(username, password);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setLoading(true);
    try {
      // `host` is used as both the API base URL and the token storage key
      const { user } = await login(host, host, username.trim(), password);
      setAuth(user, host);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  const hostLabel = (() => {
    try { return new URL(host).hostname; } catch { return host; }
  })();

  return (
    <div className={styles.viewport}>
      <div className={styles.card}>

        {/* Wordmark */}
        <div className={styles.wordmark}>
          <span className={styles.logo}>Spectrus</span>
          <p className={styles.tagline}>Sign in to <strong>{hostLabel}</strong></p>
        </div>

        {/* Form */}
        <form className={styles.form} onSubmit={handleSubmit} noValidate>

          {formError && (
            <div className={styles.formError} role="alert">
              {formError}
            </div>
          )}

          {/* Username */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-username">
              Username
            </label>
            <input
              id="login-username"
              className={['input', fieldErrors.username ? styles.inputError : ''].join(' ').trim()}
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              disabled={loading}
              aria-invalid={!!fieldErrors.username}
              aria-describedby={fieldErrors.username ? 'login-username-err' : undefined}
              onChange={(e) => {
                setUsername(e.target.value);
                revalidate(e.target.value, password);
              }}
            />
            <span
              id="login-username-err"
              className={styles.fieldError}
              role="alert"
              aria-live="polite"
            >
              {fieldErrors.username ?? ''}
            </span>
          </div>

          {/* Password */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="login-password">
              Password
            </label>
            <input
              id="login-password"
              className={['input', fieldErrors.password ? styles.inputError : ''].join(' ').trim()}
              type="password"
              autoComplete="current-password"
              value={password}
              disabled={loading}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'login-password-err' : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                revalidate(username, e.target.value);
              }}
            />
            <span
              id="login-password-err"
              className={styles.fieldError}
              role="alert"
              aria-live="polite"
            >
              {fieldErrors.password ?? ''}
            </span>
          </div>

          <button
            type="submit"
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={loading}
          >
            {loading ? 'Signing in…' : 'Sign in'}
          </button>

        </form>

        {/* Desktop app notice */}
        <p className={styles.notice}>
          Looking to join a server?{' '}
          <a
            href="https://github.com/clk-66/spectrus/releases"
            target="_blank"
            rel="noreferrer"
            className={styles.link}
          >
            Download the Spectrus desktop app.
          </a>
        </p>

      </div>
    </div>
  );
}
