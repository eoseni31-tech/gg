CREATE TABLE `authenticated_sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`platform_user_id` text NOT NULL,
	FOREIGN KEY (`token_hash`) REFERENCES `sessions`(`token_hash`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `initial_access` (
	`couple_id` text PRIMARY KEY NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`couple_id`) REFERENCES `couples`(`id`) ON UPDATE no action ON DELETE no action
);
