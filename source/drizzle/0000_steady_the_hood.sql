CREATE TABLE `attempts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_key` text NOT NULL,
	`wod_id` integer NOT NULL,
	`user_id` text NOT NULL,
	`athlete` text NOT NULL,
	`scores` text NOT NULL,
	`source` text NOT NULL,
	`style` text NOT NULL,
	`notes` text NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`wod_id`) REFERENCES `workouts`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `attempts_request_key_unique` ON `attempts` (`request_key`);--> statement-breakpoint
CREATE INDEX `attempt_wod_idx` ON `attempts` (`wod_id`);--> statement-breakpoint
CREATE TABLE `workouts` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`request_key` text NOT NULL,
	`owner_id` text NOT NULL,
	`creator` text NOT NULL,
	`definition` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `workouts_request_key_unique` ON `workouts` (`request_key`);