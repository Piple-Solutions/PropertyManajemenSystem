import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/shared/Button';

const inputStyle: React.CSSProperties = {
  width: '100%', height: '44px', padding: '12px 14px', backgroundColor: '#FFFFFF',
  border: '1px solid #C7BBAB', borderRadius: '8px', fontSize: '14px',
  fontFamily: 'var(--font-family-sans)', color: '#232D36', outline: 'none', boxSizing: 'border-box',
};

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '14px', fontWeight: 500, marginBottom: '4px', color: '#232D36',
};

export default function ChangePasswordPage() {
  const navigate = useNavigate();
  const { changePassword, isLoading, error, user } = useAuth();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState(false);

  if (!user) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh', backgroundColor: '#EEEDE9' }}>
        <div style={{ textAlign: 'center' }}>
          <h2 style={{ color: '#232D36', fontFamily: 'var(--font-family-sans)' }}>Please login first</h2>
          <Link to="/login" style={{ color: '#97764D' }}>Go to Login</Link>
        </div>
      </div>
    );
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage('');
    if (newPassword !== confirmPassword) { setMessage('Passwords do not match'); return; }
    if (newPassword.length < 6) { setMessage('New password must be at least 6 characters'); return; }
    const result = await changePassword(currentPassword, newPassword);
    if (result) { setMessage('Password changed successfully!'); setSuccess(true); setTimeout(() => navigate('/dashboard'), 2000); }
    else { setMessage('Current password is incorrect'); }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', backgroundColor: '#EEEDE9', padding: '20px' }}>
      <div style={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #C7BBAB', padding: '24px', width: '440px', maxWidth: '90vw' }}>
        <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#232D36', fontFamily: 'var(--font-family-sans)', textAlign: 'center', marginBottom: '20px', marginTop: 0 }}>Change Password</h2>
        {message && <div role="status" style={{ backgroundColor: success ? '#E3EDE4' : '#EEEDE9', border: `1px solid ${success ? '#2F5D37' : '#C7BBAB'}`, color: success ? '#2F5D37' : '#962222', borderRadius: '8px', padding: '12px', marginBottom: '16px', textAlign: 'center', fontSize: '14px' }}>{message}</div>}
        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div>
            <label style={labelStyle}>Current Password</label>
            <input type="password" placeholder="Enter current password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} required aria-label="Current Password" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>New Password</label>
            <input type="password" placeholder="Min 6 characters" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required aria-label="New Password" style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle}>Confirm New Password</label>
            <input type="password" placeholder="Confirm new password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required aria-label="Confirm New Password" style={inputStyle} />
          </div>
          {error && <div role="alert" style={{ color: '#962222', fontSize: '14px', textAlign: 'center' }}>{error}</div>}
          <Button type="submit" variant="primary" disabled={isLoading}>{isLoading ? 'Changing...' : 'Change Password'}</Button>
          <div style={{ textAlign: 'center', marginTop: '12px' }}>
            <Link to="/dashboard" style={{ color: '#97764D', fontSize: '14px' }}>Back to Dashboard</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
