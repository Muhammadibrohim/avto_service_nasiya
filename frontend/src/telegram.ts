type TgButton = { show(): void; hide(): void; onClick(cb: () => void): void; offClick(cb: () => void): void };
type TgWebApp = {
  initData: string;
  initDataUnsafe?: { start_param?: string };
  ready(): void;
  expand(): void;
  colorScheme?: "light" | "dark";
  BackButton?: TgButton;
  HapticFeedback?: { notificationOccurred(t: "success" | "error" | "warning"): void; selectionChanged(): void };
  showConfirm?: (message: string, cb: (ok: boolean) => void) => void;
  openTelegramLink?: (url: string) => void;
  setHeaderColor?: (c: string) => void;
  setBackgroundColor?: (c: string) => void;
  version?: string;
  isVersionAtLeast?: (v: string) => boolean;
};

export const tg: TgWebApp | undefined = (window as unknown as { Telegram?: { WebApp?: TgWebApp } }).Telegram?.WebApp;

export function haptic(type: "success" | "error" | "warning") {
  try { tg?.HapticFeedback?.notificationOccurred(type); } catch { /* old clients */ }
}

/** Telegram-native confirm with a browser fallback. */
export function confirmDialog(message: string): Promise<boolean> {
  return new Promise((resolve) => {
    if (tg?.showConfirm && tg.isVersionAtLeast?.("6.2")) {
      try { tg.showConfirm(message, resolve); return; } catch { /* fall through */ }
    }
    resolve(window.confirm(message));
  });
}

export function initTelegram() {
  tg?.ready?.();
  tg?.expand?.();
  try { tg?.setHeaderColor?.("#0d1219"); tg?.setBackgroundColor?.("#080b10"); } catch { /* old clients */ }
}
