import type { Knex } from 'knex'
import { AppError, notFound } from '../lib/errors'
import type { UserRow } from '../types'
import { committedCents } from './bids'

export const MAX_DEPOSIT_CENTS = 1_000_000_00 // R$ 1.000.000,00 por depósito (saldo simulado)

export async function getWallet(db: Knex, userId: string) {
  const user = (await db('users').where({ id: userId }).first()) as UserRow | undefined
  if (!user) throw notFound('Usuário')
  const committed = await committedCents(db, userId)
  const transactions = await db('wallet_transactions')
    .where({ user_id: userId })
    .orderBy('created_at', 'desc')
    .limit(50)
    .select('id', 'type', 'amount_cents', 'note', 'lot_id', 'created_at')

  return {
    totalCents: user.balance_cents,
    committedCents: committed,
    availableCents: user.balance_cents - committed,
    transactions: transactions.map((t) => ({
      id: t.id as string,
      type: t.type as string,
      amountCents: t.amount_cents as number,
      note: t.note as string | null,
      lotId: t.lot_id as string | null,
      createdAt: (t.created_at as Date).toISOString(),
    })),
  }
}

export async function deposit(db: Knex, userId: string, amountCents: number) {
  if (!Number.isInteger(amountCents) || amountCents <= 0) {
    throw new AppError(422, 'INVALID_AMOUNT', 'Informe um valor de depósito maior que zero.')
  }
  if (amountCents > MAX_DEPOSIT_CENTS) {
    throw new AppError(422, 'DEPOSIT_TOO_LARGE', 'O depósito simulado é limitado a R$ 1.000.000,00 por operação.')
  }
  await db.transaction(async (trx) => {
    const user = (await trx('users').where({ id: userId }).forUpdate().first()) as UserRow | undefined
    if (!user) throw notFound('Usuário')
    if (user.role !== 'bidder') {
      throw new AppError(403, 'FORBIDDEN', 'Apenas licitantes possuem carteira para depósito.')
    }
    await trx('users').where({ id: userId }).increment('balance_cents', amountCents)
    await trx('wallet_transactions').insert({
      user_id: userId,
      type: 'deposit',
      amount_cents: amountCents,
      note: 'Depósito simulado',
    })
  })
  return getWallet(db, userId)
}
