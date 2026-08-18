-- Telegram retries must not duplicate the same audit event for one update.
CREATE UNIQUE INDEX "audit_logs_telegram_update_id_event_type_key"
ON "audit_logs"("telegram_update_id", "event_type");
