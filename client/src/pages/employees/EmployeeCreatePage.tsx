import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { EmployeeForm } from '@/components/employees/EmployeeForm';
import { Button } from '@/components/ui/Button';
import { Card, CardContent } from '@/components/ui/Card';
import { PageHeader } from '@/components/ui/PageHeader';
import { toMessage } from '@/lib/api';
import { createEmployee } from '@/services/employee.service';
import type { EmployeePayload } from '@/types/hr';

export function EmployeeCreatePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (values: Record<string, string>) => createEmployee(values as unknown as EmployeePayload),
    onSuccess: (employee) => {
      toast.success(`${employee.firstName} ${employee.lastName} added`);
      void queryClient.invalidateQueries({ queryKey: ['employees'] });
      void navigate(`/employees/${employee.id}`, { replace: true });
    },
    onError: (error) => {
      setFormError(toMessage(error));
      toast.error(toMessage(error));
    },
  });

  return (
    <>
      <PageHeader
        title="Add employee"
        description="Create the employee profile first, then invite them to sign in from the Users page."
        breadcrumbs={[{ label: 'Employees', to: '/employees' }, { label: 'Add employee' }]}
        actions={
          <Button variant="secondary" leftIcon={<ArrowLeft className="h-4 w-4" />} onClick={() => navigate('/employees')}>
            Cancel
          </Button>
        }
      />

      <Card className="max-w-4xl">
        <CardContent className="pt-6">
          <EmployeeForm
            mode="create"
            formError={formError}
            isSubmitting={mutation.isPending}
            onSubmit={(values) => {
              setFormError(null);
              mutation.mutate(values);
            }}
            onCancel={() => navigate('/employees')}
          />
        </CardContent>
      </Card>
    </>
  );
}
