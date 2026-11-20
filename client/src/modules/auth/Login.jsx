import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../core/auth.jsx';
import { Input, useForm } from '../../core/ui.jsx';

export default function Login() {
  const { login } = useAuth();
  const nav = useNavigate();
  const { values, set, errors, busy, submit } = useForm({ email: '', password: '' });

  const onSubmit = (e) => {
    e.preventDefault();
    submit(async (v) => {
      const me = await login(v.email, v.password);
      nav(me?.role === 'super_admin' ? '/admin' : '/app');
    });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <div className="auth-logo"><div className="brand-mark">IBT</div>IBT Travels CRM</div>
        <form className="card stack" onSubmit={onSubmit}>
          <div>
            <h1>Log in</h1>
            <p className="muted">Welcome back. Enter your work email and password.</p>
          </div>
          {errors._form && <div className="alert bad">{errors._form}</div>}
          <Input label="Email" type="email" autoComplete="email" value={values.email} onChange={set('email')} error={errors.email} required />
          <Input label="Password" type="password" autoComplete="current-password" value={values.password} onChange={set('password')} error={errors.password} required />
          <button className="btn" style={{ width: '100%', justifyContent: 'center' }} disabled={busy}>
            {busy ? 'Logging in…' : 'Log in'}
          </button>
          <p className="muted small" style={{ textAlign: 'center' }}>
            New travel company? <Link to="/register">Register your organisation</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
