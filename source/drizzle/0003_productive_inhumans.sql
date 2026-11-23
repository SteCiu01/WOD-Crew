CREATE TABLE `crew_members` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`name_key` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `crew_members_name_key_unique` ON `crew_members` (`name_key`);--> statement-breakpoint
ALTER TABLE `attempts` ADD `member_id` integer REFERENCES crew_members(id);--> statement-breakpoint
CREATE INDEX `attempt_member_idx` ON `attempts` (`member_id`);--> statement-breakpoint
ALTER TABLE `workouts` ADD `creator_member_id` integer REFERENCES crew_members(id);