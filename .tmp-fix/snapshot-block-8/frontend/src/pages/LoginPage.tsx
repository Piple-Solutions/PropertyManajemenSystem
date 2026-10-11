import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { AuthSplitLayout } from '@/components/AuthSplitLayout';

const REMEMBER_KEY = 'pms.rememberedEmail';

export default function LoginPage() {
  const navigate = useNavigate();
  const { login, isLoading, error } = useAuth();
  const [email, setEmail] = useState(() => localStorage.getItem(REMEMBER_KEY) || '');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(() => localStorage.getItem(REMEMBER_KEY) !== null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (remember) localStorage.setItem(REMEMBER_KEY, email);
    else localStorage.removeItem(REMEMBER_KEY);
    const success = await login(email, password);
    if (success) navigate('/dashboard');
  };

  return (
    <AuthSplitLayout
      heading="Welcome back"
      description="Thank you for getting back. Please login to your account by filling out the form below."
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Input
          label="Email Address"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="john@hotel.com"
          autoComplete="username"
          required
        />
        <Input
          label="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Enter your password"
          autoComplete="current-password"
          required
        />
        {error && <div role="alert" className="auth-error">{error}</div>}
        <div className="auth-row">
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
          <Link to="/forgot-password" className="auth-link auth-link-muted">Forgot password?</Link>
        </div>
        <div className="auth-actions">
          <Button type="submit" variant="primary" disabled={isLoading} style={{ backgroundColor: '#97764D', color: '#FFFFFF', borderColor: '#97764D' }} hoverStyle={{ backgroundColor: '#7A5E3E', color: '#FFFFFF', borderColor: '#7A5E3E' }}>{isLoading ? 'Loading...' : 'Login'}</Button>
          <Button type="button" variant="outline" onClick={() => navigate('/register')}>Sign Up</Button>
        </div>
      </form>
    </AuthSplitLayout>
  );
}
