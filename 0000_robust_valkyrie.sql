CREATE TABLE `audit` (
	`id` text PRIMARY KEY NOT NULL,
	`wedding_id` text NOT NULL,
	`actor_id` text,
	`action` text NOT NULL,
	`before_json` text,
	`after_json` text,
	`created_at` text NOT NULL,
	FOREIGN KEY (`wedding_id`) REFERENCES `weddings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `audit_wedding_date` ON `audit` (`wedding_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `couples` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `events` (
	`id` text PRIMARY KEY NOT NULL,
	`wedding_id` text NOT NULL,
	`name` text NOT NULL,
	`date` text,
	FOREIGN KEY (`wedding_id`) REFERENCES `weddings`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `events_wedding` ON `events` (`wedding_id`);--> statement-breakpoint
CREATE TABLE `gifts` (
	`id` text PRIMARY KEY NOT NULL,
	`wedding_id` text NOT NULL,
	`guest_name` text DEFAULT '' NOT NULL,
	`amount_minor` integer NOT NULL,
	`currency` text NOT NULL,
	`method` text NOT NULL,
	`source` text NOT NULL,
	`status` text NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`reference` text,
	`request_key` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`wedding_id`) REFERENCES `weddings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "gift_amount" CHECK("gifts"."amount_minor" BETWEEN 1 AND 1000000000000),
	CONSTRAINT "gift_currency" CHECK("gifts"."currency" IN ('NGN','USD','GBP','EUR')),
	CONSTRAINT "gift_method" CHECK("gifts"."method" IN ('cash','bank_transfer')),
	CONSTRAINT "gift_source" CHECK("gifts"."source" IN ('guest_report','couple_manual')),
	CONSTRAINT "gift_status" CHECK("gifts"."status" IN ('reported','received','void'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `gift_request` ON `gifts` (`wedding_id`,`request_key`);--> statement-breakpoint
CREATE INDEX `gift_wedding_date` ON `gifts` (`wedding_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `invitees` (
	`id` text PRIMARY KEY NOT NULL,
	`wedding_id` text NOT NULL,
	`name` text NOT NULL,
	`token_hash` text NOT NULL,
	`max_party` integer DEFAULT 1 NOT NULL,
	FOREIGN KEY (`wedding_id`) REFERENCES `weddings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "invitee_party_limit" CHECK("invitees"."max_party" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `invitees_token_hash_unique` ON `invitees` (`token_hash`);--> statement-breakpoint
CREATE INDEX `invitees_wedding` ON `invitees` (`wedding_id`);--> statement-breakpoint
CREATE TABLE `rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`count` integer NOT NULL,
	`expires` integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE `rsvp_events` (
	`rsvp_id` text NOT NULL,
	`event_id` text NOT NULL,
	FOREIGN KEY (`rsvp_id`) REFERENCES `rsvps`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`event_id`) REFERENCES `events`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_event_pair` ON `rsvp_events` (`rsvp_id`,`event_id`);--> statement-breakpoint
CREATE TABLE `rsvps` (
	`id` text PRIMARY KEY NOT NULL,
	`wedding_id` text NOT NULL,
	`invitee_id` text,
	`guest_name` text NOT NULL,
	`attending` integer NOT NULL,
	`party` integer NOT NULL,
	`notes` text DEFAULT '' NOT NULL,
	`request_key` text NOT NULL,
	`edit_hash` text NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`wedding_id`) REFERENCES `weddings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`invitee_id`) REFERENCES `invitees`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "rsvp_attending" CHECK("rsvps"."attending" IN (0,1)),
	CONSTRAINT "rsvp_party" CHECK("rsvps"."party" BETWEEN 0 AND 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_request` ON `rsvps` (`wedding_id`,`request_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `rsvp_invitee` ON `rsvps` (`invitee_id`);--> statement-breakpoint
CREATE INDEX `rsvp_wedding_date` ON `rsvps` (`wedding_id`,`updated_at`);--> statement-breakpoint
CREATE TABLE `weddings` (
	`id` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`slug` text NOT NULL,
	`title` text NOT NULL,
	`max_party` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "wedding_party_limit" CHECK("weddings"."max_party" BETWEEN 1 AND 20)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `weddings_slug_unique` ON `weddings` (`slug`);--> statement-breakpoint
CREATE INDEX `weddings_owner` ON `weddings` (`couple_id`);
--> statement-breakpoint
CREATE TRIGGER `rsvp_invitee_tenant` BEFORE INSERT ON rsvps WHEN NEW.invitee_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM invitees WHERE id=NEW.invitee_id AND wedding_id=NEW.wedding_id) BEGIN SELECT RAISE(ABORT,'Invalid invitation'); END;
--> statement-breakpoint
CREATE TRIGGER `rsvp_event_tenant` BEFORE INSERT ON rsvp_events WHEN NOT EXISTS(SELECT 1 FROM rsvps r JOIN events e ON e.wedding_id=r.wedding_id WHERE r.id=NEW.rsvp_id AND e.id=NEW.event_id) BEGIN SELECT RAISE(ABORT,'Invalid event'); END;
