CREATE TABLE `recovery_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`wedding_id` text NOT NULL,
	`contact` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`wedding_id`) REFERENCES `weddings`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "recovery_status" CHECK("recovery_requests"."status" IN ('pending','closed'))
);
--> statement-breakpoint
CREATE INDEX `recovery_wedding` ON `recovery_requests` (`wedding_id`);