export interface AdminActionError {
  error: string;
}

export interface AdminActionSuccess<T = undefined> {
  ok: true;
  data?: T;
}

export function actionError(error: string): AdminActionError {
  return { error };
}

export function actionSuccess<T>(data?: T): AdminActionSuccess<T> {
  return { ok: true, data };
}
