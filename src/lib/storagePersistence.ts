/*
 * 永続化の要求（第7章 7-11）。
 * IndexedDB の既定の保存は best-effort 扱いで、空き容量の逼迫時にオリジンごと破棄されうる。
 * とくに Safari は一定期間アクセスの無いサイトのデータを破棄する。放っておけば消えるものとして扱う。
 */

export type PersistState = 'granted' | 'denied' | 'unsupported';

/**
 * 永続化を要求し、現在の状態を返す。
 * API 非対応は denied と同じ扱いにはせず unsupported として区別するが、
 * 画面上はどちらも「消えないことは保証されない」と伝える。
 */
export async function requestPersistentStorage(): Promise<PersistState> {
  try {
    if (typeof navigator === 'undefined' || !navigator.storage?.persist) return 'unsupported';
    if (await navigator.storage.persisted?.()) return 'granted';
    return (await navigator.storage.persist()) ? 'granted' : 'denied';
  } catch {
    return 'unsupported';
  }
}

export const PERSIST_STATE_LABEL: Record<PersistState, string> = {
  granted: '永続化されています',
  denied: '永続化されていません',
  unsupported: '永続化の状態を確認できません',
};

/** granted 以外は、消えうることを利用者に伝える文言を出す。 */
export function persistNotice(state: PersistState): string | null {
  if (state === 'granted') return null;
  return 'この端末では画像の保存が永続化されていません。アプリを開かない期間が続くと、ブラウザが画像を破棄することがあります。重要な案件は出力してファイルを手元に保存してください。';
}
