export interface AdminActionError {
  error: string;
}

export function actionError(error: string): AdminActionError {
  return { error };
}
