import { useMutation, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useToast } from '../components/ui';
import { ApiError } from './api';
import { useI18n } from './i18n';

/** Mutatsiya + xato toast'da (tilga mos) + so'rovlarni yangilash */
export function useApiMutation<TVars, TData = unknown>(
  fn: (vars: TVars) => Promise<TData>,
  opts: { invalidate?: QueryKey[]; success?: string; onSuccess?: (data: TData, vars: TVars) => void; onError?: (e: unknown) => boolean | void } = {},
) {
  const qc = useQueryClient();
  const toast = useToast();
  const { errorText } = useI18n();
  return useMutation({
    mutationFn: fn,
    onSuccess: async (data, vars) => {
      await Promise.all((opts.invalidate ?? []).map((k) => qc.invalidateQueries({ queryKey: k })));
      if (opts.success) toast(opts.success, 'success');
      opts.onSuccess?.(data, vars);
    },
    onError: (e) => {
      // onError true qaytarsa — ekran xatoni o'zi ko'rsatdi
      if (opts.onError?.(e) === true) return;
      toast(e instanceof ApiError ? errorText(e.code, e.message) : 'Xatolik', 'error');
    },
  });
}
