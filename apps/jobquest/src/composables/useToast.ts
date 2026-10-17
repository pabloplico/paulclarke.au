import { type InjectionKey, inject, provide, type Ref, ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  tone: 'success' | 'error';
}

export interface Toasts {
  toasts: Ref<Toast[]>;
  show: (message: string, tone?: Toast['tone']) => void;
  dismiss: (id: number) => void;
}

export const TOASTS: InjectionKey<Toasts> = Symbol('toasts');

const DISMISS_MS = 5000;

/** The toast list the root layout provides and ToastHost shows. */
export function createToasts(): Toasts {
  const toasts = ref<Toast[]>([]);
  let nextId = 1;

  function dismiss(id: number) {
    toasts.value = toasts.value.filter((toast) => toast.id !== id);
  }

  function show(message: string, tone: Toast['tone'] = 'success') {
    const id = nextId++;
    toasts.value = [...toasts.value, { id, message, tone }];
    setTimeout(() => dismiss(id), DISMISS_MS);
  }

  return { toasts, show, dismiss };
}

export function provideToasts(): Toasts {
  const toasts = createToasts();
  provide(TOASTS, toasts);
  return toasts;
}

export function useToast(): Toasts {
  const toasts = inject(TOASTS);
  if (!toasts) throw new Error('useToast() needs provideToasts() in a parent component');
  return toasts;
}
