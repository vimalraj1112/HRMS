import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Save } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { z } from 'zod';
import { Button } from '@/components/ui/Button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { PageHeader } from '@/components/ui/PageHeader';
import { CardSkeleton, ErrorState } from '@/components/ui/States';
import { toMessage } from '@/lib/api';
import { can } from '@/lib/permissions';
import { listSettings, updateSetting } from '@/services/settings.service';
import { useAuthStore } from '@/stores/auth.store';
import {
  SETTING_KEYS,
  WEEKEND_DAY_OPTIONS,
  type Setting,
  type SettingKey,
  type WeekendDay,
} from '@/types/settings';

const schema = z.object({
  companyName: z.string().trim().min(2, 'Company name is too short').max(160),
  defaultCurrency: z.string().trim().regex(/^[A-Z]{3}$/, 'Use a 3 letter ISO code such as INR'),
  workingDaysPerWeek: z.coerce.number().int().min(1).max(7),
  weekendDays: z
    .array(z.enum(WEEKEND_DAY_OPTIONS))
    .min(1, 'Pick at least one weekend day')
    .max(7, 'Weekend days must be unique'),
  enableAnnouncements: z.boolean(),
});

interface Draft {
  companyName: string;
  defaultCurrency: string;
  workingDaysPerWeek: string;
  weekendDays: WeekendDay[];
  enableAnnouncements: boolean;
}

const isWeekendDay = (value: unknown): value is WeekendDay =>
  typeof value === 'string' && (WEEKEND_DAY_OPTIONS as readonly string[]).includes(value);

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);

const asNumberString = (value: unknown, fallback = '5'): string =>
  typeof value === 'number' ? String(value) : fallback;

const asDays = (value: unknown): WeekendDay[] => (Array.isArray(value) ? value.filter(isWeekendDay) : []);

const asBoolean = (value: unknown, fallback: boolean): boolean =>
  typeof value === 'boolean' ? value : fallback;

function toDraft(settings: Setting[]): Draft {
  const byKey = new Map(settings.map((setting) => [setting.key, setting.value]));
  return {
    companyName: asString(byKey.get('companyName')),
    defaultCurrency: asString(byKey.get('defaultCurrency')),
    workingDaysPerWeek: asNumberString(byKey.get('workingDaysPerWeek')),
    weekendDays: asDays(byKey.get('weekendDays')),
    enableAnnouncements: asBoolean(byKey.get('enableAnnouncements'), true),
  };
}

function toPayload(draft: Draft): Record<SettingKey, unknown> {
  return {
    companyName: draft.companyName.trim(),
    defaultCurrency: draft.defaultCurrency.trim().toUpperCase(),
    workingDaysPerWeek: Number(draft.workingDaysPerWeek),
    weekendDays: draft.weekendDays,
    enableAnnouncements: draft.enableAnnouncements,
  };
}

function loadedPayload(settings: Setting[]): Record<SettingKey, unknown> {
  const draft = toDraft(settings);
  return toPayload(draft);
}

export function SettingsPage() {
  const role = useAuthStore((state) => state.user?.role);
  const canManage = can(role, 'settings:manage');
  const queryClient = useQueryClient();

  const settings = useQuery({ queryKey: ['settings'], queryFn: listSettings });
  const [override, setOverride] = useState<Draft | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);

  // Edits live in `override`; without it the form mirrors whatever the API returned.
  const draft = override ?? (settings.data ? toDraft(settings.data) : null);

  const updateDraft = (patch: Partial<Draft>) => {
    if (draft) setOverride({ ...draft, ...patch });
  };

  const save = useMutation({
    mutationFn: async (payload: Record<SettingKey, unknown>) => {
      const loaded = settings.data ? loadedPayload(settings.data) : null;
      const changed = SETTING_KEYS.filter(
        (key) => loaded === null || JSON.stringify(payload[key]) !== JSON.stringify(loaded[key]),
      );
      await Promise.all(changed.map((key) => updateSetting(key, { value: payload[key] })));
    },
    onSuccess: () => {
      toast.success('Settings saved');
      setFormError(null);
      setOverride(null);
      void queryClient.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (error) => {
      setFormError(toMessage(error));
      toast.error(toMessage(error));
    },
  });

  if (settings.isPending) {
    return (
      <>
        <PageHeader title="System settings" description="Organisation wide defaults." />
        <CardSkeleton className="min-h-64" />
      </>
    );
  }

  if (settings.error) {
    return (
      <>
        <PageHeader title="System settings" description="Organisation wide defaults." />
        <Card>
          <ErrorState message={toMessage(settings.error)} onRetry={() => void settings.refetch()} />
        </Card>
      </>
    );
  }

  const loaded = settings.data;
  const descriptionFor = (key: SettingKey): string | undefined =>
    loaded.find((setting) => setting.key === key)?.description ?? undefined;

  const dirty = draft !== null && loaded !== null &&
    JSON.stringify(toPayload(draft)) !== JSON.stringify(loadedPayload(loaded));

  const submit = () => {
    if (!draft) return;
    const result = schema.safeParse(draft);
    if (!result.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of result.error.issues) fieldErrors[issue.path.join('.')] = issue.message;
      setErrors(fieldErrors);
      return;
    }
    setErrors({});
    setFormError(null);
    save.mutate(toPayload(draft));
  };

  return (
    <>
      <PageHeader
        title="System settings"
        description="Defaults used across payroll, attendance and announcements."
        actions={
          canManage && draft !== null ? (
            <Button
              variant="secondary"
              leftIcon={<RotateCcw className="h-4 w-4" aria-hidden />}
              disabled={!dirty || save.isPending}
              onClick={() => {
                setOverride(null);
                setErrors({});
                setFormError(null);
              }}
            >
              Reset
            </Button>
          ) : null
        }
      />

      {!canManage ? (
        <p className="mb-4 rounded-lg bg-slate-100 px-4 py-3 text-sm text-slate-600">
          You can review these settings, but only administrators can change them.
        </p>
      ) : null}

      {draft === null ? (
        <CardSkeleton className="min-h-64" />
      ) : (
        <Card>
          <CardHeader title="Organisation" description="Applies to every user of this workspace." />

          <CardContent className="space-y-5">
            {formError ? (
              <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">{formError}</p>
            ) : null}

            <Input
              label="Company name"
              value={draft.companyName}
              error={errors.companyName}
              hint={descriptionFor('companyName')}
              disabled={!canManage}
              onChange={(event) => updateDraft({ companyName: event.target.value })}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                label="Default currency"
                value={draft.defaultCurrency}
                error={errors.defaultCurrency}
                hint={descriptionFor('defaultCurrency')}
                disabled={!canManage}
                onChange={(event) => updateDraft({ defaultCurrency: event.target.value.toUpperCase() })}
              />
              <Input
                label="Working days per week"
                type="number"
                min={1}
                max={7}
                value={draft.workingDaysPerWeek}
                error={errors.workingDaysPerWeek}
                hint={descriptionFor('workingDaysPerWeek')}
                disabled={!canManage}
                onChange={(event) => updateDraft({ workingDaysPerWeek: event.target.value })}
              />
            </div>

            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700">Weekend days</span>
              <div className="flex flex-wrap gap-4">
                {WEEKEND_DAY_OPTIONS.map((day) => (
                  <label key={day} className="flex items-center gap-2 text-sm text-slate-600">
                    <input
                      type="checkbox"
                      checked={draft.weekendDays.includes(day)}
                      disabled={!canManage}
                      onChange={(event) =>
                        updateDraft({
                          weekendDays: event.target.checked
                            ? [...draft.weekendDays, day]
                            : draft.weekendDays.filter((entry) => entry !== day),
                        })
                      }
                      className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-100"
                    />
                    {day.toUpperCase()}
                  </label>
                ))}
              </div>
              {errors.weekendDays ? (
                <p className="mt-1.5 text-xs text-rose-600">{errors.weekendDays}</p>
              ) : null}
              {descriptionFor('weekendDays') ? (
                <p className="mt-1.5 text-xs text-slate-500">{descriptionFor('weekendDays')}</p>
              ) : null}
            </div>

            <div className="flex items-start justify-between gap-4 rounded-lg bg-slate-50 px-4 py-3">
              <div>
                <p className="text-sm font-medium text-slate-800">Enable announcements</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {descriptionFor('enableAnnouncements') ?? 'Whether HR can publish announcements.'}
                </p>
              </div>
              <input
                type="checkbox"
                checked={draft.enableAnnouncements}
                disabled={!canManage}
                onChange={(event) => updateDraft({ enableAnnouncements: event.target.checked })}
                aria-label="Enable announcements"
                className="mt-1 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-100"
              />
            </div>
          </CardContent>

          {canManage ? (
            <CardFooter className="justify-between">
              <span className="text-xs text-slate-400">
                {dirty ? 'You have unsaved changes.' : 'All changes are saved.'}
              </span>
              <Button leftIcon={<Save className="h-4 w-4" aria-hidden />} isLoading={save.isPending} disabled={!dirty} onClick={submit}>
                Save changes
              </Button>
            </CardFooter>
          ) : null}
        </Card>
      )}
    </>
  );
}
