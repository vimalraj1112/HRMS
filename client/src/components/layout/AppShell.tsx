import { LogOut, Menu, Search, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { Avatar } from '@/components/ui/Avatar';
import { NotificationBell } from '@/components/layout/NotificationBell';
import { Button } from '@/components/ui/Button';
import { visibleSections } from '@/config/navigation';
import { toMessage } from '@/lib/api';
import { logoutRequest } from '@/services/auth.service';
import { useAuthStore } from '@/stores/auth.store';
import { cn, initials } from '@/lib/utils';

interface AppShellProps {
  children: ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const user = useAuthStore((state) => state.user);
  const clear = useAuthStore((state) => state.clear);
  const navigate = useNavigate();
  const sections = visibleSections(user?.role);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await logoutRequest();
    } catch (error) {
      toast.error(toMessage(error));
    } finally {
      clear();
      setSigningOut(false);
      void navigate('/login', { replace: true });
    }
  };

  const displayName = user?.employee
    ? `${user.employee.firstName} ${user.employee.lastName}`
    : (user?.email ?? 'User');

  return (
    <div className="min-h-screen bg-slate-50">
      {mobileOpen ? (
        <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setMobileOpen(false)} aria-hidden />
      ) : null}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
              SL
            </div>
            <div className="leading-tight">
              <p className="text-sm font-semibold text-slate-900">SuperLink</p>
              <p className="text-xs text-slate-500">HRMS</p>
            </div>
          </div>
          <button
            type="button"
            className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close navigation"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="scrollbar-thin flex-1 space-y-5 overflow-y-auto px-3 py-4">
          {sections.map((section) => (
            <div key={section.title}>
              <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                {section.title}
              </p>
              <ul className="space-y-0.5">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      onClick={() => setMobileOpen(false)}
                      className={({ isActive }) =>
                        cn(
                          'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
                          isActive
                            ? 'bg-brand-50 text-brand-700'
                            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                        )
                      }
                    >
                      <item.icon className="h-4.5 w-4.5 shrink-0" aria-hidden />
                      <span className="truncate">{item.label}</span>
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="flex items-center gap-3 rounded-lg px-2 py-2">
            <Avatar
              src={user?.employee?.profilePhotoUrl ?? null}
              fallback={initials(user?.employee?.firstName, user?.employee?.lastName)}
              size="sm"
            />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
              <p className="truncate text-xs text-slate-500">{user?.role?.replace(/_/g, ' ') ?? ''}</p>
            </div>
            <button
              type="button"
              onClick={() => void handleLogout()}
              disabled={signingOut}
              className="rounded-md p-2 text-slate-500 hover:bg-slate-100 hover:text-rose-600 disabled:opacity-50"
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <button
            type="button"
            className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden"
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="relative hidden max-w-md flex-1 sm:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              type="search"
              placeholder="Search employees, documents, requests..."
              className="w-full rounded-lg border border-slate-300 bg-slate-50 py-2 pl-9 pr-3 text-sm placeholder:text-slate-400 focus:border-brand-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-brand-100"
            />
          </div>

          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <div className="relative">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMenuOpen((open) => !open)}
                aria-label="Account menu"
                className="rounded-full"
              >
                <Avatar
                  src={user?.employee?.profilePhotoUrl ?? null}
                  fallback={initials(user?.employee?.firstName, user?.employee?.lastName)}
                  size="sm"
                />
              </Button>
              {menuOpen ? (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  <div className="border-b border-slate-100 px-4 py-2">
                    <p className="truncate text-sm font-medium text-slate-900">{displayName}</p>
                    <p className="truncate text-xs text-slate-500">{user?.email}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleLogout()}
                    disabled={signingOut}
                    className="flex w-full items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    <LogOut className="h-4 w-4" aria-hidden />
                    {signingOut ? 'Signing out...' : 'Sign out'}
                  </button>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        <main className="px-4 py-6 sm:px-6 lg:px-8">
          <div className="mx-auto w-full max-w-7xl">{children}</div>
        </main>
      </div>
    </div>
  );
}
