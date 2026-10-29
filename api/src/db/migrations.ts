import type { Knex } from 'knex'

type Migration = { up(db: Knex): Promise<void>; down(db: Knex): Promise<void> }

/**
 * Migrations declaradas em código (e não em arquivos soltos) para que o `tsup`
 * consiga empacotá-las no build de produção sem depender de diretórios em runtime.
 */
export const migrations: Record<string, Migration> = {
  '001_init': {
    async up(db) {
      await db.raw(`
        create table users (
          id uuid primary key default gen_random_uuid(),
          name text not null,
          email text not null,
          password_hash text not null,
          role text not null check (role in ('auctioneer', 'bidder')),
          balance_cents bigint not null default 0 check (balance_cents >= 0),
          created_at timestamptz not null default now()
        );
        create unique index users_email_key on users (lower(email));

        create table lots (
          id uuid primary key default gen_random_uuid(),
          auctioneer_id uuid not null references users (id),
          status text not null default 'open' check (status in ('open', 'settled', 'canceled')),
          title text not null,
          description text,
          image_url text,
          attributes jsonb not null default '{}'::jsonb,
          starting_bid_cents bigint not null check (starting_bid_cents > 0),
          min_increment_cents bigint not null check (min_increment_cents > 0),
          starts_at timestamptz not null,
          original_ends_at timestamptz not null,
          ends_at timestamptz not null,
          current_bid_cents bigint,
          leader_id uuid references users (id),
          bid_count integer not null default 0,
          head_hash text,
          head_seal text not null,
          winner_id uuid references users (id),
          winning_bid_cents bigint,
          settled_at timestamptz,
          canceled_at timestamptz,
          created_at timestamptz not null default now(),
          check (ends_at > starts_at)
        );
        create index lots_status_ends_idx on lots (status, ends_at);
        create index lots_leader_idx on lots (leader_id) where status = 'open';
        create index lots_auctioneer_idx on lots (auctioneer_id);

        create table bids (
          id uuid primary key default gen_random_uuid(),
          lot_id uuid not null references lots (id),
          bidder_id uuid not null references users (id),
          seq integer not null check (seq > 0),
          amount_cents bigint not null check (amount_cents > 0),
          placed_at timestamptz not null,
          prev_hash text not null,
          hash text not null,
          unique (lot_id, seq)
        );
        create index bids_bidder_idx on bids (bidder_id);

        create table wallet_transactions (
          id uuid primary key default gen_random_uuid(),
          user_id uuid not null references users (id),
          type text not null check (type in ('deposit', 'purchase', 'sale', 'release')),
          amount_cents bigint not null,
          lot_id uuid references lots (id),
          note text,
          created_at timestamptz not null default now()
        );
        create index wallet_tx_user_idx on wallet_transactions (user_id, created_at desc);

        create table receipts (
          id uuid primary key default gen_random_uuid(),
          code text not null unique,
          lot_id uuid not null unique references lots (id),
          title text not null,
          winner_alias text not null,
          auctioneer_alias text not null,
          amount_cents bigint not null,
          bid_count integer not null,
          head_hash text not null,
          issued_at timestamptz not null,
          seal text not null
        );

        create table catalog_cache (
          key text primary key,
          payload jsonb not null,
          fetched_at timestamptz not null default now()
        );

        -- O histórico de lances é "append-only": UPDATE/DELETE/TRUNCATE comuns falham.
        -- Mesmo que alguém desative este gatilho com privilégios de dono do banco, a
        -- auditoria (cadeia de HMAC + selo do lote) detecta qualquer alteração.
        create function bids_block_mutation() returns trigger as $$
        begin
          raise exception 'bids é append-only: % bloqueado', tg_op;
        end;
        $$ language plpgsql;

        create trigger bids_append_only
          before update or delete on bids
          for each row execute function bids_block_mutation();

        create trigger bids_no_truncate
          before truncate on bids
          for each statement execute function bids_block_mutation();
      `)
    },
    async down(db) {
      await db.raw(`
        drop table if exists catalog_cache;
        drop table if exists receipts;
        drop table if exists wallet_transactions;
        drop table if exists bids;
        drop function if exists bids_block_mutation();
        drop table if exists lots;
        drop table if exists users;
      `)
    },
  },
}

export const migrationSource: Knex.MigrationSource<string> = {
  getMigrations: async () => Object.keys(migrations).sort(),
  getMigrationName: (name) => name,
  getMigration: async (name) => migrations[name]!,
}
