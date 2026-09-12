CREATE INDEX "funnel_sessions_user_id_started_at_idx"
ON "funnel_sessions" ("user_id", "started_at");

CREATE INDEX "funnel_sessions_visitor_id_started_at_idx"
ON "funnel_sessions" ("visitor_id", "started_at");
