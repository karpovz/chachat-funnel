-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "normalized_email" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visitors" (
    "id" UUID NOT NULL,
    "last_resolved_user_id" UUID,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_seen_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visitors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funnel_sessions" (
    "id" UUID NOT NULL,
    "visitor_id" UUID NOT NULL,
    "user_id" UUID,
    "funnel_version" TEXT NOT NULL,
    "current_step" TEXT NOT NULL DEFAULT 'landing',
    "landing_url" TEXT NOT NULL,
    "referrer" TEXT,
    "utm_source" TEXT,
    "utm_medium" TEXT,
    "utm_campaign" TEXT,
    "utm_content" TEXT,
    "utm_term" TEXT,
    "user_agent" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "completed_at" TIMESTAMPTZ,

    CONSTRAINT "funnel_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "events" (
    "id" UUID NOT NULL,
    "client_event_id" UUID,
    "visitor_id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID,
    "name" TEXT NOT NULL,
    "screen" TEXT,
    "step_index" INTEGER,
    "funnel_version" TEXT NOT NULL,
    "properties" JSONB NOT NULL DEFAULT '{}',
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "received_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "quiz_answers" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "question_id" TEXT NOT NULL,
    "answer_ids" JSONB NOT NULL,
    "answered_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "quiz_answers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "plans" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "billing_description" TEXT NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL,

    CONSTRAINT "plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchases" (
    "id" UUID NOT NULL,
    "checkout_key" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "plan_id" UUID NOT NULL,
    "plan_name" TEXT NOT NULL,
    "plan_slug" TEXT NOT NULL,
    "amount_minor" INTEGER NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "billing_description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'created',
    "failure_code" TEXT,
    "failure_message" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,
    "succeeded_at" TIMESTAMPTZ,

    CONSTRAINT "purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_attempts" (
    "id" UUID NOT NULL,
    "purchase_id" UUID NOT NULL,
    "idempotency_key" UUID NOT NULL,
    "attempt_number" INTEGER NOT NULL,
    "status" TEXT NOT NULL,
    "card_brand" TEXT,
    "card_last4" TEXT,
    "processor_reference" TEXT,
    "failure_code" TEXT,
    "failure_message" TEXT,
    "started_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finished_at" TIMESTAMPTZ,
    "duration_ms" INTEGER,

    CONSTRAINT "payment_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_normalized_email_key" ON "users"("normalized_email");

-- CreateIndex
CREATE UNIQUE INDEX "events_client_event_id_key" ON "events"("client_event_id");

-- CreateIndex
CREATE INDEX "events_name_occurred_at_idx" ON "events"("name", "occurred_at");

-- CreateIndex
CREATE INDEX "events_session_id_occurred_at_idx" ON "events"("session_id", "occurred_at");

-- CreateIndex
CREATE INDEX "events_user_id_occurred_at_idx" ON "events"("user_id", "occurred_at");

-- CreateIndex
CREATE UNIQUE INDEX "quiz_answers_session_id_question_id_key" ON "quiz_answers"("session_id", "question_id");

-- CreateIndex
CREATE UNIQUE INDEX "plans_slug_key" ON "plans"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_checkout_key_key" ON "purchases"("checkout_key");

-- CreateIndex
CREATE UNIQUE INDEX "purchases_session_id_key" ON "purchases"("session_id");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_idempotency_key_key" ON "payment_attempts"("idempotency_key");

-- CreateIndex
CREATE UNIQUE INDEX "payment_attempts_purchase_id_attempt_number_key" ON "payment_attempts"("purchase_id", "attempt_number");

-- AddForeignKey
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_last_resolved_user_id_fkey" FOREIGN KEY ("last_resolved_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funnel_sessions" ADD CONSTRAINT "funnel_sessions_visitor_id_fkey" FOREIGN KEY ("visitor_id") REFERENCES "visitors"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funnel_sessions" ADD CONSTRAINT "funnel_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "funnel_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "quiz_answers" ADD CONSTRAINT "quiz_answers_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "funnel_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_session_id_fkey" FOREIGN KEY ("session_id") REFERENCES "funnel_sessions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_plan_id_fkey" FOREIGN KEY ("plan_id") REFERENCES "plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_attempts" ADD CONSTRAINT "payment_attempts_purchase_id_fkey" FOREIGN KEY ("purchase_id") REFERENCES "purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


CREATE UNIQUE INDEX payment_attempts_one_processing ON payment_attempts(purchase_id) WHERE status = 'processing';
ALTER TABLE purchases ADD CONSTRAINT purchases_status_check CHECK (status IN ('created','processing','succeeded','failed'));
ALTER TABLE payment_attempts ADD CONSTRAINT attempts_status_check CHECK (status IN ('processing','succeeded','declined','timed_out','failed'));
ALTER TABLE plans ADD CONSTRAINT plans_amount_positive CHECK (amount_minor > 0);
ALTER TABLE purchases ADD CONSTRAINT purchases_amount_positive CHECK (amount_minor > 0);
INSERT INTO plans(id,slug,name,amount_minor,currency,billing_description,is_active,sort_order) VALUES
('11111111-1111-4111-8111-111111111111','monthly','Monthly',2999,'USD','billed monthly',true,1),
('22222222-2222-4222-8222-222222222222','annual','Annual',5999,'USD','billed yearly',true,2),
('33333333-3333-4333-8333-333333333333','lifetime','Lifetime',8999,'USD','one-time access',true,3);
