-- Cover nullable admin foreign keys used by review, resolution, and settings audit flows.
CREATE INDEX "rewards_reviewed_by_id_idx" ON "rewards"("reviewed_by_id");
CREATE INDEX "fraud_flags_resolved_by_id_idx" ON "fraud_flags"("resolved_by_id");
CREATE INDEX "system_settings_updated_by_id_idx" ON "system_settings"("updated_by_id");
