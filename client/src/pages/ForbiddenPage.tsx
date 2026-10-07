import { Link } from 'react-router-dom';
import { ShieldAlert } from 'lucide-react';

export function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-center">
      <div className="mb-4 rounded-full bg-amber-50 p-4 text-amber-600">
        <ShieldAlert className="h-8 w-8" aria-hidden />
      </div>
      <h1 className="text-2xl font-semibold text-slate-900">Access denied</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        Your role does not have permission to view this page. Contact your HR administrator if you believe this is a
        mistake.
      </p>
      <Link
        to="/dashboard"
        className="mt-6 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white hover:bg-brand-700"
      >
        Back to dashboard
      </Link>
    </div>
  );
}
