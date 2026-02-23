import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { register } from '../../api/auth';
import { useAuthStore } from '../../stores/useAuthStore';
import { useUIStore } from '../../stores/useUIStore';
import { API_BASE, DEFAULT_SERVER_ID } from '../../constants';
import styles from './Auth.module.css';

// ---- Validation ----------------------------------------------------------

interface FieldErrors {
  username?: string;
  password?: string;
  confirm?: string;
}

function validate(username: string, password: string, confirm: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!username.trim()) {
    errors.username = 'Username is required.';
  } else if (username.trim().length < 3) {
    errors.username = 'Username must be at least 3 characters.';
  } else if (!/^[a-zA-Z0-9_]+$/.test(username.trim())) {
    errors.username = 'Only letters, numbers, and underscores.';
  }
  if (!password) {
    errors.password = 'Password is required.';
  } else if (password.length < 8) {
    errors.password = 'Password must be at least 8 characters.';
  }
  if (!confirm) {
    errors.confirm = 'Please confirm your password.';
  } else if (password && confirm !== password) {
    errors.confirm = 'Passwords do not match.';
  }
  return errors;
}

// ---- Component -----------------------------------------------------------

export function Register() {
  const navigate = useNavigate();
  const setAuth = useAuthStore((s) => s.setAuth);
  const setActiveServerId = useUIStore((s) => s.setActiveServerId);

  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [confirm,  setConfirm]    = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState('');
  const [loading, setLoading]     = useState(false);
  const [touched, setTouched]     = useState(false);

  function revalidate(u = username, p = password, c = confirm) {
    if (touched) setFieldErrors(validate(u, p, c));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    setFormError('');

    const errs = validate(username, password, confirm);
    if (Object.keys(errs).length > 0) {
      setFieldErrors(errs);
      return;
    }

    setLoading(true);
    try {
      // register auto-logs in and returns tokens + user
      const { user } = await register(API_BASE, DEFAULT_SERVER_ID, username.trim(), password);
      setAuth(user);
      setActiveServerId(DEFAULT_SERVER_ID);
      navigate('/', { replace: true });
    } catch (err) {
      setFormError(
        err instanceof Error ? err.message : 'Registration failed. Please try again.'
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
            <label className={styles.label} htmlFor="reg-username">
              Username
            </label>
            <input
              id="reg-username"
              className={['input', fieldErrors.username ? styles.inputError : ''].join(' ').trim()}
              type="text"
              autoComplete="username"
              autoFocus
              value={username}
              disabled={loading}
              aria-invalid={!!fieldErrors.username}
              aria-describedby={fieldErrors.username ? 'reg-username-err' : undefined}
              onChange={(e) => {
                setUsername(e.target.value);
                revalidate(e.target.value, password, confirm);
              }}
            />
            <span
              id="reg-username-err"
              className={styles.fieldError}
              role="alert"
              aria-live="polite"
            >
              {fieldErrors.username ?? ''}
            </span>
          </div>

          {/* Password */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-password">
              Password
            </label>
            <input
              id="reg-password"
              className={['input', fieldErrors.password ? styles.inputError : ''].join(' ').trim()}
              type="password"
              autoComplete="new-password"
              value={password}
              disabled={loading}
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? 'reg-password-err' : undefined}
              onChange={(e) => {
                setPassword(e.target.value);
                revalidate(username, e.target.value, confirm);
              }}
            />
            <span
              id="reg-password-err"
              className={styles.fieldError}
              role="alert"
              aria-live="polite"
            >
              {fieldErrors.password ?? ''}
            </span>
          </div>

          {/* Confirm password */}
          <div className={styles.field}>
            <label className={styles.label} htmlFor="reg-confirm">
              Confirm password
            </label>
            <input
              id="reg-confirm"
              className={['input', fieldErrors.confirm ? styles.inputError : ''].join(' ').trim()}
              type="password"
              autoComplete="new-password"
              value={confirm}
              disabled={loading}
              aria-invalid={!!fieldErrors.confirm}
              aria-describedby={fieldErrors.confirm ? 'reg-confirm-err' : undefined}
              onChange={(e) => {
                setConfirm(e.target.value);
                revalidate(username, password, e.target.value);
              }}
            />
            <span
              id="reg-confirm-err"
              className={styles.fieldError}
              role="alert"
              aria-live="polite"
            >
              {fieldErrors.confirm ?? ''}
            </span>
          </div>

          <button
            type="submit"
            className={`btn btn-primary ${styles.submitBtn}`}
            disabled={loading}
          >
            {loading ? 'Creating account…' : 'Create account'}
          </button>

        </form>

        {/* Switch link */}
        <p className={styles.switchLink}>
          Already have an account?{' '}
          <Link to="/login" className={styles.link}>Sign in</Link>
        </p>

      </div>
    </div>
  );
}
