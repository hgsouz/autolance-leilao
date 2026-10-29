export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message)
  }
}

export const notFound = (what = 'Recurso') => new AppError(404, 'NOT_FOUND', `${what} não encontrado.`)
export const forbidden = (msg = 'Você não tem permissão para esta ação.') =>
  new AppError(403, 'FORBIDDEN', msg)
