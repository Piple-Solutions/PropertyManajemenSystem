import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import authService from '@/services/authService';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { AuthSplitLayout } from '@/components/AuthSplitLayout';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [devResetLink, setDevResetLink] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleEmailSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setDevResetLink('');
    try {
      const result = await authService.forgotPassword(email);
      setMessage(result.message);
      setSent(true);
      // Only present when the backend runs with DEV_EXPOSE_RESET_TOKEN=true
      // (local development). Never exposed in production.
      if (result.resetToken) {
        setDevResetLink(`/reset-password?token=${encodeURIComponent(result.resetToken)}`);
      }
    } catch {
      setMessage('Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout
      heading="Forgot password"
      description="Enter your account email and we will send you reset instructions."
    >
      {message && <div role="status" className="auth-status" style={{ marginBottom: '16px' }}>{message}</div>}
      {devResetLink && (
        <div role="status" className="auth-status" style={{ marginBottom: '16px' }}>
          Development mode — open your reset link: <Link to={devResetLink} className="auth-link">Reset password</Link>
        </div>
      )}
      {!sent ? (
        <form onSubmit={handleEmailSubmit} className="auth-form">
          <Input
            label="Email Address"
            type="email"
            placeholder="john@hotel.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          <div className="auth-actions">
            <Button type="submit" variant="primary" disabled={isSubmitting || !email.trim()}>{isSubmitting ? 'Sending...' : 'Send Reset Link'}</Button>
          </div>
          <div className="auth-foot">
            <Link to="/login" className="auth-link">Back to Login</Link>
          </div>
        </form>
      ) : (
        <div className="auth-foot">
          <Link to="/login" className="auth-link">Back to Login</Link>
        </div>
      )}
    </AuthSplitLayout>
  );
}
