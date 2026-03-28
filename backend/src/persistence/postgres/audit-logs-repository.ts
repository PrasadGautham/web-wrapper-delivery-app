import { PoolClient } from 'pg';

import { AuditLogRecord } from '../../domain/models.js';
import { toJson } from './pg-json.js';

export class PostgresAuditLogsRepository {
  async list(client: PoolClient): Promise<AuditLogRecord[]> {
    const result = await client.query(`
      select id, at, actor_type, actor_id, tenant_id, action, entity_type, entity_id, metadata
      from audit_logs
      order by at desc
    `);
    return result.rows.map((row) => ({
      id: row.id,
      at: row.at.toISOString(),
      actorType: row.actor_type,
      actorId: row.actor_id,
      tenantId: row.tenant_id ?? null,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      metadata: row.metadata ?? undefined,
    }));
  }

  async appendOne(client: PoolClient, item: AuditLogRecord): Promise<void> {
    await client.query(
      `insert into audit_logs(id, at, actor_type, actor_id, tenant_id, action, entity_type, entity_id, metadata)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb)
       on conflict (id) do update set
         at = excluded.at,
         actor_type = excluded.actor_type,
         actor_id = excluded.actor_id,
         tenant_id = excluded.tenant_id,
         action = excluded.action,
         entity_type = excluded.entity_type,
         entity_id = excluded.entity_id,
         metadata = excluded.metadata`,
      [item.id, item.at, item.actorType, item.actorId, item.tenantId ?? null, item.action, item.entityType, item.entityId, toJson(item.metadata ?? {})],
    );
  }

  async upsertMany(client: PoolClient, items: AuditLogRecord[]): Promise<void> {
    for (const item of items) {
      await this.appendOne(client, item);
    }
  }

  async deleteMissing(client: PoolClient, ids: string[]): Promise<void> {
    await client.query('delete from audit_logs where id <> all($1::text[])', [ids]);
  }
}
