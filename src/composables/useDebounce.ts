import { ref, watch, type Ref, type WatchSource } from "vue";

/**
 * Creates a debounced computed-like ref that recalculates after a delay.
 * Batches rapid changes into a single recalculation.
 */
export function useDebouncedComputed<T>(
  source: WatchSource,
  compute: () => T,
  delayMs = 150,
): Ref<T> {
  const result = ref<T>(compute()) as Ref<T>;
  let timer: ReturnType<typeof setTimeout> | null = null;

  watch(
    source,
    () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        result.value = compute();
        timer = null;
      }, delayMs);
    },
    { deep: true },
  );

  return result;
}
