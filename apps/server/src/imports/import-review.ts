import type { ImportDraft, ParseResult } from '@procure-lite/shared';

export interface ReviewPage {
  page: number;
  reasons: string[];
  reviewed: boolean;
}

/** The API view and transactional confirmation use the same page-completion rule. */
export function reviewPages(
  local: ParseResult | undefined,
  aiStatus: string,
  aiPages: { page: number }[],
  draft: ImportDraft | null | undefined,
): ReviewPage[] {
  const count = local?.pageCount ?? 1;
  return Array.from({ length: count }, (_, i) => {
    const page = i + 1;
    const reasons: string[] = [];
    if (local?.pages?.find((p) => p.page === page)?.status !== 'DONE')
      reasons.push(local?.pageCount ? '本地解析未完成' : '未能取得页数，请核对原件全部页面');
    // A scheduled review remains required even if disabled/cancelled before it finishes.
    if (aiStatus !== 'DISABLED' && !aiPages.some((p) => p.page === page))
      reasons.push('GPT 复核未完成');
    return { page, reasons, reviewed: !!draft?.reviewedPages.some((p) => p.page === page) };
  }).filter((p) => p.reasons.length > 0);
}
