/** Supabase PostgREST / Auth 등 — 사용자·로그용 한 줄 + 디버그용 code */

export type SupabaseLikeError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

export class AppError extends Error {
  readonly code?: string;
  readonly details?: string;
  readonly hint?: string;
  readonly context?: string;

  constructor(
    message: string,
    opts?: { code?: string; details?: string; hint?: string; context?: string }
  ) {
    super(message);
    this.name = "AppError";
    this.code = opts?.code;
    this.details = opts?.details;
    this.hint = opts?.hint;
    this.context = opts?.context;
  }
}

/** alert / toast용: `[PGRST202] message (details)` */
export function formatSupabaseError(error: SupabaseLikeError, context?: string): string {
  const code = error.code?.trim();
  const head = code ? `[${code}]` : "[NO_CODE]";
  const ctx = context ? `${context}: ` : "";
  const main = error.message?.trim() || "알 수 없는 오류";
  const extra = error.details?.trim();
  const line = extra ? `${head} ${main} (${extra})` : `${head} ${main}`;
  return ctx + line;
}

export function appErrorFromSupabase(error: SupabaseLikeError, context: string): AppError {
  return new AppError(formatSupabaseError(error, context), {
    code: error.code,
    details: error.details,
    hint: error.hint,
    context,
  });
}

/** catch (e) → 사용자에게 보여줄 문자열 */
export function formatUserFacingError(e: unknown): string {
  if (e instanceof AppError) {
    return e.message;
  }
  if (e && typeof e === "object" && "message" in e) {
    const o = e as SupabaseLikeError;
    if (o.code || o.details) {
      return formatSupabaseError(o);
    }
    if (typeof o.message === "string" && o.message) {
      return o.message;
    }
  }
  if (e instanceof Error && e.message) {
    return e.message;
  }
  return "알 수 없는 오류가 발생했습니다.";
}

/** console.error용 — code 포함 JSON */
export function logApiError(context: string, error: unknown): void {
  if (error instanceof AppError) {
    console.error(`[${context}]`, {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return;
  }
  console.error(`[${context}]`, error);
}
