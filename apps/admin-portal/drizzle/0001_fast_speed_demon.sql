CREATE TABLE "admin_section_dependencies" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "admin_section_dependencies_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"sectionId" integer NOT NULL,
	"dependsOnSectionId" integer NOT NULL,
	"relationType" varchar(30) NOT NULL,
	"description" text,
	"createdAt" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "admin_section_dependencies" ADD CONSTRAINT "admin_section_dependencies_sectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("sectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "admin_section_dependencies" ADD CONSTRAINT "admin_section_dependencies_dependsOnSectionId_admin_workspace_sections_id_fk" FOREIGN KEY ("dependsOnSectionId") REFERENCES "public"."admin_workspace_sections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "admin_section_dep_unique" ON "admin_section_dependencies" USING btree ("sectionId","dependsOnSectionId");--> statement-breakpoint
CREATE INDEX "admin_section_dep_section_idx" ON "admin_section_dependencies" USING btree ("sectionId");--> statement-breakpoint
CREATE INDEX "admin_section_dep_target_idx" ON "admin_section_dependencies" USING btree ("dependsOnSectionId");