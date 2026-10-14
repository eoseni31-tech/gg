CREATE TABLE `access_codes` (
	`code_hash` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`couple_id` text NOT NULL,
	`csrf` text NOT NULL,
	`expires` integer NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `session_owner` ON `sessions` (`couple_id`);