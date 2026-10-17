CREATE TABLE `chats` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`title` text NOT NULL,
	`messages` text DEFAULT '[]' NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `chats_profile_updated_idx` ON `chats` (`profileId`,`updatedAt`);--> statement-breakpoint
CREATE TABLE `jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`title` text NOT NULL,
	`company` text NOT NULL,
	`rawText` text DEFAULT '' NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`software` text DEFAULT '[]' NOT NULL,
	`requirements` text DEFAULT '[]' NOT NULL,
	`salaryRange` text,
	`seniorityLevel` text DEFAULT 'not_specified' NOT NULL,
	`category` text,
	`positionSubcategory` text,
	`url` text,
	`notes` text,
	`dateAdded` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `jobs_profile_idx` ON `jobs` (`profileId`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`createdAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_email_unique` ON `profiles` (`email`);--> statement-breakpoint
CREATE TABLE `search_prefs` (
	`profileId` text PRIMARY KEY NOT NULL,
	`location` text DEFAULT '' NOT NULL,
	`country` text DEFAULT 'gb' NOT NULL,
	`distanceKm` integer,
	`salaryMin` integer,
	`maxDaysOld` integer,
	`fullTimeOnly` integer,
	`includeRemote` integer,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `skills` (
	`id` text PRIMARY KEY NOT NULL,
	`profileId` text NOT NULL,
	`name` text NOT NULL,
	`proficiency` integer NOT NULL,
	`category` text,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `skills_profile_name_idx` ON `skills` (`profileId`,`name`);--> statement-breakpoint
CREATE TABLE `taxonomy` (
	`profileId` text PRIMARY KEY NOT NULL,
	`categories` text DEFAULT '[]' NOT NULL,
	`canonicalMap` text DEFAULT '{}' NOT NULL,
	`skillGroups` text DEFAULT '{}' NOT NULL,
	`updatedAt` text DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) NOT NULL,
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `usage` (
	`profileId` text NOT NULL,
	`day` text NOT NULL,
	`requests` integer DEFAULT 0 NOT NULL,
	`costMicroUsd` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`profileId`, `day`),
	FOREIGN KEY (`profileId`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE cascade
);
