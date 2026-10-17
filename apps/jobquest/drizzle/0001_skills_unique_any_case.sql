DROP INDEX `skills_profile_name_idx`;--> statement-breakpoint
CREATE UNIQUE INDEX `skills_profile_name_idx` ON `skills` (`profileId`,lower("name"));