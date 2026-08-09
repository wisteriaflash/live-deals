import type Database from "better-sqlite3";
import type { DealInput } from "./types.js";

export class DealStore {
  constructor(private db: Database.Database) {}

  close() {
    this.db.close();
  }

  insertRaw(sourceId: string | null, payload: string): number {
    const info = this.db
      .prepare(
        `INSERT INTO raw_snapshots (source_id, payload, fetched_at) VALUES (?, ?, ?)`,
      )
      .run(sourceId, payload, new Date().toISOString());
    return Number(info.lastInsertRowid);
  }

  insertDeal(deal: DealInput): number {
    const info = this.db
      .prepare(
        `INSERT INTO deals (fingerprint, brand, title, summary, url, city, origin, created_at)
         VALUES (@fingerprint, @brand, @title, @summary, @url, @city, @origin, @created_at)`,
      )
      .run({ ...deal, created_at: new Date().toISOString() });
    return Number(info.lastInsertRowid);
  }

  markNotified(dealId: number, status: "sent" | "pending" | "failed", error?: string) {
    this.db
      .prepare(
        `INSERT INTO notifications (deal_id, status, attempts, last_error, sent_at)
         VALUES (?, ?, 1, ?, ?)`,
      )
      .run(
        dealId,
        status,
        error ?? null,
        status === "sent" ? new Date().toISOString() : null,
      );
  }

  wasNotifiedRecently(fingerprint: string, windowHours: number): boolean {
    const row = this.db
      .prepare(
        `SELECT n.sent_at as sent_at
         FROM deals d
         JOIN notifications n ON n.deal_id = d.id
         WHERE d.fingerprint = ? AND n.status = 'sent' AND n.sent_at IS NOT NULL
         ORDER BY n.sent_at DESC LIMIT 1`,
      )
      .get(fingerprint) as { sent_at: string } | undefined;
    if (!row) return false;
    const ageMs = Date.now() - new Date(row.sent_at).getTime();
    return ageMs < windowHours * 3600_000;
  }

  recordSourceSuccess(sourceId: string) {
    this.db
      .prepare(
        `INSERT INTO source_status (source_id, fail_count, last_error, updated_at)
         VALUES (?, 0, NULL, ?)
         ON CONFLICT(source_id) DO UPDATE SET fail_count=0, last_error=NULL, updated_at=excluded.updated_at`,
      )
      .run(sourceId, new Date().toISOString());
  }

  recordSourceFailure(sourceId: string, error: string): number {
    this.db
      .prepare(
        `INSERT INTO source_status (source_id, fail_count, last_error, updated_at)
         VALUES (?, 1, ?, ?)
         ON CONFLICT(source_id) DO UPDATE SET
           fail_count = source_status.fail_count + 1,
           last_error = excluded.last_error,
           updated_at = excluded.updated_at`,
      )
      .run(sourceId, error, new Date().toISOString());
    const row = this.db
      .prepare(`SELECT fail_count FROM source_status WHERE source_id = ?`)
      .get(sourceId) as { fail_count: number };
    return row.fail_count;
  }

  listPendingNotifications(): Array<{ notificationId: number; dealId: number }> {
    return this.db
      .prepare(
        `SELECT id as notificationId, deal_id as dealId FROM notifications WHERE status = 'pending'`,
      )
      .all() as Array<{ notificationId: number; dealId: number }>;
  }

  getDeal(dealId: number): DealInput | null {
    const row = this.db
      .prepare(
        `SELECT fingerprint, brand, title, summary, url, city, origin FROM deals WHERE id = ?`,
      )
      .get(dealId) as
      | {
          fingerprint: string;
          brand: string;
          title: string;
          summary: string;
          url: string | null;
          city: string;
          origin: DealInput["origin"];
        }
      | undefined;
    if (!row) return null;
    return row;
  }

  markNotificationSent(notificationId: number) {
    this.db
      .prepare(
        `UPDATE notifications
         SET status = 'sent', sent_at = ?, attempts = attempts + 1, last_error = NULL
         WHERE id = ?`,
      )
      .run(new Date().toISOString(), notificationId);
  }

  markNotificationFailed(notificationId: number, error: string) {
    this.db
      .prepare(
        `UPDATE notifications
         SET status = 'pending', attempts = attempts + 1, last_error = ?
         WHERE id = ?`,
      )
      .run(error, notificationId);
  }

  insertPriceObservation(input: {
    normalizedName: string;
    price: number;
    sourceId: string | null;
    seenAt?: string;
  }): number {
    const info = this.db
      .prepare(
        `INSERT INTO price_history (normalized_name, price, source_id, seen_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(
        input.normalizedName,
        input.price,
        input.sourceId,
        input.seenAt ?? new Date().toISOString(),
      );
    return Number(info.lastInsertRowid);
  }

  listPricesForName(normalizedName: string, windowDays: number): number[] {
    const since = new Date(Date.now() - windowDays * 86400_000).toISOString();
    const rows = this.db
      .prepare(
        `SELECT price FROM price_history
         WHERE normalized_name = ? AND seen_at >= ?
         ORDER BY seen_at ASC`,
      )
      .all(normalizedName, since) as Array<{ price: number }>;
    return rows.map((r) => r.price);
  }
}
