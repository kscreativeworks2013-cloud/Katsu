import { Link } from 'react-router-dom';
import { EmptyState, PageHeader } from '../ui/primitives';

export function NotFound() {
  return (
    <>
      <PageHeader title="ページが見つかりません" />
      <EmptyState
        title="URLをご確認ください"
        description="お探しの画面は移動または削除された可能性があります。"
        action={
          <Link className="btn" to="/">
            ダッシュボードへ戻る
          </Link>
        }
      />
    </>
  );
}
