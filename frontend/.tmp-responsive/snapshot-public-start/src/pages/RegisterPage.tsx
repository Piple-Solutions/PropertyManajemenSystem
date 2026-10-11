import { useState, type FormEvent } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/shared/Button';
import { Input } from '@/components/shared/Input';
import { AuthSplitLayout } from '@/components/AuthSplitLayout';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register, isLoading, error } = useAuth();
  const [formData, setFormData] = useState({ name: '', email: '', password: '', confirmPassword: '' });
  const [formErrors, setFormErrors] = useState<{ name?: string; email?: string; password?: string; confirmPassword?: string }>({});

  const validateForm = (): boolean => {
    const errors: { name?: string; email?: string; password?: string; confirmPassword?: string } = {};
    if (!formData.name.trim() || formData.name.trim().length < 2) errors.name = 'Name must be at least 2 characters';
    if (!formData.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) errors.email = 'Please enter a valid email';
    if (!formData.password || formData.password.length < 6) errors.password = 'Password must be at least 6 characters';
    if (formData.password !== formData.confirmPassword) errors.confirmPassword = 'Passwords do not match';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    await register(formData.name, formData.email, formData.password);
    navigate('/login');
  };

  return (
    <AuthSplitLayout
      heading="Create account"
      description="Join the team. Fill out the form below to create your account."
    >
      <form onSubmit={handleSubmit} className="auth-form">
        <Input
          label="Full Name"
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="John Doe"
          autoComplete="name"
          error={!!formErrors.name}
          errorMessage={formErrors.name}
        />
        <Input
          label="Email"
          type="email"
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="john@hotel.com"
          autoComplete="email"
          error={!!formErrors.email}
          errorMessage={formErrors.email}
        />
        <Input
          label="Password"
          type="password"
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Min 6 characters"
          autoComplete="new-password"
          error={!!formErrors.password}
          errorMessage={formErrors.password}
        />
        <Input
          label="Confirm Password"
          type="password"
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          placeholder="Confirm password"
          autoComplete="new-password"
          error={!!formErrors.confirmPassword}
          errorMessage={formErrors.confirmPassword}
        />
        {error && <div role="alert" className="auth-error">{error}</div>}
        <div className="auth-actions">
          <Button type="submit" variant="primary" disabled={isLoading}>{isLoading ? 'Creating Account...' : 'Sign Up'}</Button>
        </div>
        <div className="auth-foot">
          Already have an account? <Link to="/login" className="auth-link">Sign in</Link>
        </div>
      </form>
    </AuthSplitLayout>
  );
}
