const fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

/** Formata centavos como "R$ 1.234,56" (usado nas mensagens de erro). */
export const brl = (cents: number) => fmt.format(cents / 100)
