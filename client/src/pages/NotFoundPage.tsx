import { Link } from 'react-router-dom';
import { FileQuestion } from 'lucide-react';

export function NotFoundPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-100 px-4 text-center">
      <div className="mb-4 rounded-full bg-slate-200 p-4 text-slate-500">
        <FileQuestion className="h-8 w-8" aria-hidden />
      </div>
      <p className="text-sm font-medium text-brand-600">404</p>
      <h1 className="mt-1 text-2xl font-semibold text-slate-900">Page not found</h1>
      <p className="mt-2 max-w-md text-sm text-slate-600">
        The page you are looking for does not exist or has been moved.
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
