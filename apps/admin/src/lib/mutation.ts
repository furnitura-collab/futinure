import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { toast } from 'sonner';
import { useI18n } from '@/i18n';
import { ApiError } from './api';

/**
 * Mutatsiya + xatoni toast'da ko'rsatish + tegishli so'rovlarni yangilash.
 * ORDER_CONFLICT bo'lsa ham yangilaydi — foydalanuvchi eng so'nggi holatni ko'radi.
 */
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { invalidate?: QueryKey[]; success?: string; onSuccess?: (data: TData) => void; silentCodes?: string[] } = {},
) {
  const qc = useQueryClient();
  const { errorText } = useI18n();
  const refresh = () => Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data) => {
      await refresh();
      if (opts.success) toast.success(opts.success);
      opts.onSuccess?.(data);
    },
    onError: async (err) => {
      if (err instanceof ApiError && err.code === 'ORDER_CONFLICT') await refresh();
      if (err instanceof ApiError && opts.silentCodes?.includes(err.code)) return;
      toast.error(errorText(err));
    },
  });
}
