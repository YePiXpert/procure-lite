import { onBeforeUnmount, ref, shallowRef } from 'vue';
import { apiError } from '@/api/client';
import { createRequestGuard } from '@/utils/request';

/** Keep old content during refreshes and discard responses after navigation. */
export function useWorkflowResource<T>(fetch: () => Promise<T>) {
  const data = shallowRef<T | null>(null);
  const loading = ref(true);
  const refreshing = ref(false);
  const error = ref('');
  const guard = createRequestGuard();
  onBeforeUnmount(() => guard.abandon());

  async function load() {
    const isCurrent = guard.begin();
    loading.value = data.value === null;
    refreshing.value = data.value !== null;
    try {
      const result = await fetch();
      if (!isCurrent()) return;
      data.value = result;
      error.value = '';
    } catch (cause) {
      if (isCurrent()) error.value = apiError(cause);
    } finally {
      if (isCurrent()) {
        loading.value = false;
        refreshing.value = false;
      }
    }
  }

  function reset() {
    guard.abandon();
    data.value = null;
    error.value = '';
    loading.value = true;
  }

  return { data, loading, refreshing, error, load, reset };
}
