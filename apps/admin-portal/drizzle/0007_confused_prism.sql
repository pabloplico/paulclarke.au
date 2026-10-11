CREATE TABLE "admin_feed_items" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_feed_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"feedId" integer NOT NULL,
	"guid" varchar(500) NOT NULL,
	"title" varchar(500),
	"url" text,
	"contentHash" varchar(64),
	"inboxItemId" integer,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "admin_feeds" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_feeds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"userId" integer NOT NULL,
	"url" text NOT NULL,
	"type" varchar(20) NOT NULL,
	"label" varchar(255),
	"workspaceId" integer,
	"enabled" boolean DEFAULT true NOT NULL,
	"intervalMinutes" integer DEFAULT 60 NOT NULL,
	"lastFetchedAt" timestamp,
	"lastContentHash" varchar(64),
	"lastError" text,
	"createdAt" timestamp DEFAULT now() NOT NULL,
	"updatedAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_inbox_items" ADD COLUMN "gapFindingRef" jsonb;--> statement-breakpoint
ALTER TABLE "admin_feed_items" ADD CONSTRAINT "admin_feed_items_feedId_admin_feeds_id_fk" FOREIGN KEY ("feedId") REFERENCES "public"."admin_feeds"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feed_items" ADD CONSTRAINT "admin_feed_items_inboxItemId_admin_inbox_items_id_fk" FOREIGN KEY ("inboxItemId") REFERENCES "public"."admin_inbox_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feeds" ADD CONSTRAINT "admin_feeds_userId_admin_users_id_fk" FOREIGN KEY ("userId") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_feeds" ADD CONSTRAINT "admin_feeds_workspaceId_admin_workspaces_id_fk" FOREIGN KEY ("workspaceId") REFERENCES "public"."admin_workspaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_feed_item_guid_unique" ON "admin_feed_items" USING btree ("feedId","guid");
