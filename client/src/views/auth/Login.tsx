import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { login } from '../../api/auth';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { API_BASE, DEFAULT_SERVER_ID } from '../../constants';
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
  const navigate  = useNavigate();
  const location  = useLocation();
  const setAuth   = useAuthStore((s) => s.setAuth);
  const setActiveServerId = useUIStore((s) => s.setActiveServerId);
  // Redirect back to the originating route after login (e.g. /invite/:token?join=1)
  const from = (location.state as { from?: string } | null)?.from ?? '/';

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);
  // Only show field errors after the first submission attempt
  const [touched, setTouched] = useState(false);

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
      const { user } = await login(API_BASE, DEFAULT_SERVER_ID, username.trim(), password);
      setAuth(user);
      setActiveServerId(DEFAULT_SERVER_ID);
      navigate(from, { replace: true });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Could not sign in. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className={styles.viewport}>
      <div className={styles.card}>

        {/* Wordmark */}
        <div className={styles.wordmark}>
          <span className={styles.logo}>Spectrus</span>
          <p className={styles.tagline}>Your community. Your server.</p>
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

        {/* Switch link */}
        <p className={styles.switchLink}>
          Don't have an account?{' '}
          <Link to="/register" className={styles.link}>Create one</Link>
        </p>

      </div>
    </div>
  );
}
