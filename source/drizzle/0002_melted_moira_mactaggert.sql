ALTER TABLE `attempts` ADD `updated_at` text;--> statement-breakpoint
CREATE INDEX `attempt_created_idx` ON `attempts` (`created_at`);