/**
 * Tiny typed event bus so non-React layers (data, api) can notify the UI
 * (toasts, data-changed refreshes) without importing React code.
 */
export interface AppEvents {
  toast: { kind: 'success' | 'error' | 'info' | 'warning'; title: string; description?: string };
  'data-changed': { collection: string; resourceType?: string; patientId?: string };
  'adapter-fallback': { from: string; reason: string };
  'session-expired': { reason: string };
}

type Handler<T> = (payload: T) => void;

const handlers = new Map<keyof AppEvents, Set<Handler<never>>>();

export function on<K extends keyof AppEvents>(event: K, handler: Handler<AppEvents[K]>): () => void {
  let set = handlers.get(event) as Set<Handler<AppEvents[K]>> | undefined;
  if (!set) {
    set = new Set();
    handlers.set(event, set as Set<Handler<never>>);
  }
  set.add(handler);
  return () => {
    set!.delete(handler);
  };
}

export function emit<K extends keyof AppEvents>(event: K, payload: AppEvents[K]): void {
  const set = handlers.get(event) as Set<Handler<AppEvents[K]>> | undefined;
  set?.forEach((h) => {
    try {
      h(payload);
    } catch (e) {
      console.warn('event handler failed', e);
    }
  });
}

export function notify(kind: AppEvents['toast']['kind'], title: string, description?: string): void {
  emit('toast', { kind, title, description });
}
