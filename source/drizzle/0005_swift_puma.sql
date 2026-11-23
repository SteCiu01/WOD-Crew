ALTER TABLE `attempts` ADD `performed_on` text;--> statement-breakpoint
CREATE INDEX `attempt_member_date_idx` ON `attempts` (`member_id`,`performed_on`);