import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import authService from '@/services/authService';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { AuthSplitLayout } from '@/components/AuthSplitLayout';

export default function ResetPasswordPage() {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [token] = useState(() => new URLSearchParams(window.location.search).get('token') || '');

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) { setMessage('Passwords do not match'); return; }
    if (newPassword.length < 6) { setMessage('Password must be at least 6 characters'); return; }
    setIsSubmitting(true);
    try {
      if (token) {
        const success = await authService.resetPassword(token, newPassword);
        if (success) { setMessage('Password reset successfully! Redirecting to login...'); setTimeout(() => navigate('/login'), 2000); }
        else { setMessage('Invalid or expired token. Please request a new reset link.'); }
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthSplitLayout
      heading="Reset password"
      description="Choose a new password for your account."
    >
      {message && (
        <div
          role="status"
          className={`auth-status ${message.includes('successfully') ? 'auth-status-success' : 'auth-status-error'}`}
          style={{ marginBottom: '16px' }}
        >
          {message}
        </div>
      )}
      {!token && <p className="auth-description">No reset token provided. Please use the link from your email.</p>}
      {token && (
        <form onSubmit={handleSubmit} className="auth-form">
          <Input
            label="New Password"
            type="password"
            placeholder="Min 6 characters"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <Input
            label="Confirm New Password"
            type="password"
            placeholder="Confirm password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            autoComplete="new-password"
            required
          />
          <div className="auth-actions">
            <Button type="submit" variant="primary" disabled={isSubmitting || !token}>{isSubmitting ? 'Resetting...' : 'Reset Password'}</Button>
          </div>
        </form>
      )}
      <div className="auth-foot">
        <Link to="/login" className="auth-link">Back to Login</Link>
      </div>
    </AuthSplitLayout>
  );
}
